import { DatabaseAdapter } from "../core/adapter";



type WhereOperator =
  | "="
  | "!="
  | ">"
  | "<"
  | ">="
  | "<="
  | "LIKE"
  | "ILIKE"
  | "IN"
  | "NOT IN"
  | "IS"
  | "IS NOT";

type WhereValue = any;

interface WhereClause<T> {
  type: "AND" | "OR";
  column: keyof T;
  operator: WhereOperator;
  value: WhereValue;
}

type WhereCondition<T> = {
  [K in keyof T]?:
    | T[K] // Equality
    | { in: T[K][] }
    | { like: string }
    | { ilike: string }
    | { gt: T[K] }
    | { lt: T[K] }
    | { gte: T[K] }
    | { lte: T[K] }
    | { not: T[K] }
    | null; // IS NULL
};

// Operation types
type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export class QueryBuilder<
  TTable extends Record<string, any>,
  TResult = TTable
> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _operation: Operation = "SELECT";
  private _data: Partial<TTable> | Partial<TTable>[] | null = null; // For insert/update
  private _select: (keyof TTable)[] = [];
  private _where: WhereClause<TTable>[] = [];
  private _limit?: number;
  private _offset?: number;
  private _returning: boolean = false;

  constructor(table: string, adapter: DatabaseAdapter) {
    this._table = table;
    this._adapter = adapter;
  }

  // --- CRUD Operations ---

  insert(data: Partial<TTable> | Partial<TTable>[]): this {
    this._operation = "INSERT";
    this._data = data;
    this._returning = true;
    return this;
  }

  update(data: Partial<TTable>): this {
    this._operation = "UPDATE";
    this._data = data;
    this._returning = true;
    return this;
  }

  delete(): this {
    this._operation = "DELETE";
    this._returning = true;
    return this;
  }

  // --- Clauses ---

  select<K extends keyof TTable>(
    ...columns: K[]
  ): QueryBuilder<TTable, Pick<TTable, K>> {
    this._select = columns;
    return this as unknown as QueryBuilder<TTable, Pick<TTable, K>>;
  }

  /**
   * Add a WHERE condition (AND).
   * Supports detailed operators via object syntax.
   */
  where(conditions: WhereCondition<TTable>): this {
    this._addWhere("AND", conditions);
    return this;
  }

  /**
   * Add a WHERE condition (OR).
   */
  orWhere(conditions: WhereCondition<TTable>): this {
    this._addWhere("OR", conditions);
    return this;
  }

  private _addWhere(type: "AND" | "OR", conditions: WhereCondition<TTable>) {
    for (const [key, val] of Object.entries(conditions)) {
      const column = key as keyof TTable;

      if (val === null) {
        this._where.push({ type, column, operator: "IS", value: null });
      } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
        // Handle operators
        const ops = val as any;
        if ("in" in ops)
          this._where.push({
            type,
            column,
            operator: "IN",
            value: ops.in,
          });
        if ("notIn" in ops)
            this._where.push({
              type,
              column,
              operator: "NOT IN",
              value: ops.notIn,
            });
        if ("like" in ops)
          this._where.push({
            type,
            column,
            operator: "LIKE",
            value: ops.like,
          });
        if ("ilike" in ops)
            this._where.push({
              type,
              column,
              operator: "ILIKE",
              value: ops.ilike,
            });
        if ("gt" in ops)
          this._where.push({ type, column, operator: ">", value: ops.gt });
        if ("lt" in ops)
          this._where.push({ type, column, operator: "<", value: ops.lt });
        if ("gte" in ops)
          this._where.push({
            type,
            column,
            operator: ">=",
            value: ops.gte,
          });
        if ("lte" in ops)
          this._where.push({
            type,
            column,
            operator: "<=",
            value: ops.lte,
          });
        if ("not" in ops)
            this._where.push({
                type,
                column,
                operator: "!=",
                value: ops.not
            })
      } else {
        // Exact match
        this._where.push({ type, column, operator: "=", value: val });
      }
    }
  }

  limit(limit: number): this {
    this._limit = limit;
    return this;
  }

  offset(offset: number): this {
    this._offset = offset;
    return this;
  }

  // --- Execution ---

  async execute(): Promise<TResult[]> {
    const { sql, values } = this.toSQL();
    const result = await this._adapter.query<TResult>(sql, values);
    return result.rows;
  }

  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?:
      | ((value: TResult[]) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0 ? this._select.join(", ") : "*";
    const values: any[] = [];
    let sql = "";

    // Helper to build WHERE clause
    const buildWhere = (): string => {
      if (this._where.length === 0) return "";
      
      const clauses = this._where.map((clause, index) => {
        let condition = "";
        const col = String(clause.column);

        if (clause.operator === "IN" || clause.operator === "NOT IN") {
             if (Array.isArray(clause.value) && clause.value.length > 0) {
                 const placeholders = clause.value.map(v => {
                     values.push(v);
                     return `$${values.length}`;
                 });
                 condition = `${col} ${clause.operator} (${placeholders.join(", ")})`;
             } else {
                 // Determine behavior for empty IN/NOT IN
                 // IN [] -> False (1=0)
                 // NOT IN [] -> True (1=1)
                 condition = clause.operator === "IN" ? "1=0" : "1=1";
             }
        } else if (clause.operator === "IS" || clause.operator === "IS NOT") {
            const val = clause.value === null ? "NULL" : String(clause.value);
            condition = `${col} ${clause.operator} ${val}`;
        } else {
           values.push(clause.value);
           condition = `${col} ${clause.operator} $${values.length}`;
        }

        // Prefix with AND/OR, except for the first one
        if (index === 0) return condition;
        return `${clause.type} ${condition}`;
      });

      return ` WHERE ${clauses.join(" ")}`;
    };

    switch (this._operation) {
      case "SELECT":
        sql = `SELECT ${columns} FROM ${this._table}`;
        sql += buildWhere();
        if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
        if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;
        break;

      case "INSERT":
        if (!this._data) throw new Error("No data provided for INSERT");
        const dataIn = Array.isArray(this._data) ? this._data : [this._data];
        if (dataIn.length === 0)
          throw new Error("Empty data array for INSERT");

        const firstRow = dataIn[0] as any;
        const keys = Object.keys(firstRow);
        if (keys.length === 0) throw new Error("No columns to insert");

        const placeHolders: string[] = [];
        dataIn.forEach((row) => {
          const rowPlaceholders: string[] = [];
          keys.forEach((key) => {
            values.push((row as any)[key]);
            rowPlaceholders.push(`$${values.length}`);
          });
          placeHolders.push(`(${rowPlaceholders.join(", ")})`);
        });

        sql = `INSERT INTO ${this._table} (${keys.join(
          ", "
        )}) VALUES ${placeHolders.join(", ")}`;
        if (this._returning) sql += ` RETURNING ${columns}`;
        break;

      case "UPDATE":
        if (!this._data) throw new Error("No data provided for UPDATE");
        const updateKeys = Object.keys(this._data);
        if (updateKeys.length === 0) throw new Error("No columns to update");

        const setClauses = updateKeys.map((key) => {
          values.push((this._data as any)[key]);
          return `${key} = $${values.length}`;
        });

        sql = `UPDATE ${this._table} SET ${setClauses.join(", ")}`;
        sql += buildWhere();
        if (this._returning) sql += ` RETURNING ${columns}`;
        break;

      case "DELETE":
        sql = `DELETE FROM ${this._table}`;
        sql += buildWhere();
        if (this._returning) sql += ` RETURNING ${columns}`;
        break;
    }

    return { sql, values };
  }
}

