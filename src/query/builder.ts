import { DatabaseAdapter } from "../core/adapter.js";
import { DatabaseSchema, InferTableType } from "../types/schema.js"; // Import InferTableType

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
  column: keyof T | string; // Allow string for qualified names (table.col)
  operator: WhereOperator;
  value: WhereValue;
}

interface JoinClause {
  type: "INNER" | "LEFT" | "RIGHT" | "FULL";
  table: string;
  on: { col1: string; op: string; col2: string };
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

// Generic Where for Joined tables (keys are strings like 'users.id')
type JoinedWhereCondition = Record<string, any>;

// Operation types
type Operation = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export class QueryBuilder<
  TTable extends Record<string, any>,
  TResult = TTable,
  TSchema extends DatabaseSchema = any 
> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _operation: Operation = "SELECT";
  private _data: Partial<TTable> | Partial<TTable>[] | null = null; // For insert/update
  private _select: string[] = []; // Changed to string[] to support "table.col"
  private _where: WhereClause<any>[] = []; // Relaxed type for joins
  private _joins: JoinClause[] = [];
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

  // --- Joins ---

  /**
   * Inner Join with another table.
   */
  innerJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & InferTableType<TSchema[K]>, TSchema> {
    this._joins.push({
      type: "INNER",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  /**
   * Left Join with another table.
   * Resulting columns from the joined table might be null (handled by Partial/Nullable in implementation conceptually, 
   * but for type inference we usually intersection. In strict usage, joined props should be partial).
   */
  leftJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "LEFT",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  rightJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "RIGHT",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  fullJoin<K extends keyof TSchema & string>(
    table: K,
    col1: string,
    operator: string,
    col2: string
  ): QueryBuilder<TTable, TResult & Partial<InferTableType<TSchema[K]>>, TSchema> {
    this._joins.push({
      type: "FULL",
      table: table,
      on: { col1, op: operator, col2 },
    });
    return this as any;
  }

  // --- Clauses ---

  select(
    ...columns: string[]
  ): QueryBuilder<TTable, TResult, TSchema> { // TODO: Infer pick type if possible, but complex with joins
    this._select = columns;
    return this;
  }

  /**
   * Add a WHERE condition (AND).
   * Supports detailed operators via object syntax.
   */
  where(conditions: WhereCondition<TTable> | JoinedWhereCondition): this {
    this._addWhere("AND", conditions);
    return this;
  }

  /**
   * Add a WHERE condition (OR).
   */
  orWhere(conditions: WhereCondition<TTable> | JoinedWhereCondition): this {
    this._addWhere("OR", conditions);
    return this;
  }

  private _addWhere(type: "AND" | "OR", conditions: Record<string, any>) {
    for (const [key, val] of Object.entries(conditions)) {
      const column = key;

      if (val === null) {
        this._where.push({ type, column, operator: "IS", value: null });
      } else if (typeof val === "object" && val !== null && !(val instanceof Date)) {
        // Handle operators
        const ops = val as any;
        if ("in" in ops)
          this._where.push({ type, column, operator: "IN", value: ops.in });
        if ("notIn" in ops)
           this._where.push({ type, column, operator: "NOT IN", value: ops.notIn });
        if ("like" in ops)
          this._where.push({ type, column, operator: "LIKE", value: ops.like });
        if ("ilike" in ops)
           this._where.push({ type, column, operator: "ILIKE", value: ops.ilike });
        if ("gt" in ops)
          this._where.push({ type, column, operator: ">", value: ops.gt });
        if ("lt" in ops)
          this._where.push({ type, column, operator: "<", value: ops.lt });
        if ("gte" in ops)
          this._where.push({ type, column, operator: ">=", value: ops.gte });
        if ("lte" in ops)
          this._where.push({ type, column, operator: "<=", value: ops.lte });
        if ("not" in ops)
           this._where.push({ type, column, operator: "!=", value: ops.not });
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

  // Helper to quote identifiers (table/column names)
  private _quote(identifier: string): string {
    if (identifier === "*") return identifier;
    // Don't quote if already quoted or complex expression (simple heuristic)
    if (identifier.includes("(") || identifier.includes(" ") || identifier.startsWith('"')) {
        return identifier;
    }
    // Handle "table.column"
    if (identifier.includes(".")) {
        return identifier.split(".").map(part => `"${part}"`).join(".");
    }
    return `"${identifier}"`;
  }

  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0
        ? this._select.map(c => this._quote(c)).join(", ")
        : "*";
    const tableUser = this._quote(this._table);
    const values: any[] = [];
    let sql = "";

    // Helper to build WHERE clause
    const buildWhere = (): string => {
      if (this._where.length === 0) return "";
      
      const clauses = this._where.map((clause, index) => {
        let condition = "";
        const col = this._quote(String(clause.column));

        if (clause.operator === "IN" || clause.operator === "NOT IN") {
             if (Array.isArray(clause.value) && clause.value.length > 0) {
                 const placeholders = clause.value.map(v => {
                     values.push(v);
                     return `$${values.length}`;
                 });
                 condition = `${col} ${clause.operator} (${placeholders.join(", ")})`;
             } else {
                 condition = clause.operator === "IN" ? "1=0" : "1=1";
             }
        } else if (clause.operator === "IS" || clause.operator === "IS NOT") {
            const val = clause.value === null ? "NULL" : String(clause.value);
            condition = `${col} ${clause.operator} ${val}`;
        } else {
           values.push(clause.value);
           condition = `${col} ${clause.operator} $${values.length}`;
        }

        if (index === 0) return condition;
        return `${clause.type} ${condition}`;
      });

      return ` WHERE ${clauses.join(" ")}`;
    };

    // Helper to build JOIN clause
    const buildJoins = (): string => {
      if (this._joins.length === 0) return "";
      return " " + this._joins.map(j => {
        return `${j.type} JOIN ${this._quote(j.table)} ON ${this._quote(j.on.col1)} ${j.on.op} ${this._quote(j.on.col2)}`;
      }).join(" ");
    };

    switch (this._operation) {
      case "SELECT":
        sql = `SELECT ${columns} FROM ${tableUser}`;
        sql += buildJoins();
        sql += buildWhere();
        if (this._limit !== undefined) sql += ` LIMIT ${this._limit}`;
        if (this._offset !== undefined) sql += ` OFFSET ${this._offset}`;
        break;

      case "INSERT":
        if (this._joins.length > 0) throw new Error("INSERT does not support JOINS");
        if (!this._data) throw new Error("No data provided for INSERT");
        
        const dataIn = Array.isArray(this._data) ? this._data : [this._data];
        if (dataIn.length === 0)
          throw new Error("Empty data array for INSERT");

        const firstRow = dataIn[0] as any;
        const keys = Object.keys(firstRow);
        if (keys.length === 0) throw new Error("No columns to insert");

        const quotedKeys = keys.map(k => this._quote(k));

        const placeHolders: string[] = [];
        dataIn.forEach((row) => {
          const rowPlaceholders: string[] = [];
          keys.forEach((key) => {
            values.push((row as any)[key]); // Keep original key for access
            rowPlaceholders.push(`$${values.length}`);
          });
          placeHolders.push(`(${rowPlaceholders.join(", ")})`);
        });

        sql = `INSERT INTO ${tableUser} (${quotedKeys.join(
          ", "
        )}) VALUES ${placeHolders.join(", ")}`;
        if (this._returning) sql += ` RETURNING *`; // Default to * for Insert
        break;

      case "UPDATE":
        if (this._joins.length > 0) throw new Error("UPDATE does not support JOINS directly (use subqueries or raw SQL)");
        if (!this._data) throw new Error("No data provided for UPDATE");
        
        const updateKeys = Object.keys(this._data);
        if (updateKeys.length === 0) throw new Error("No columns to update");

        const setClauses = updateKeys.map((key) => {
          values.push((this._data as any)[key]);
          return `${this._quote(key)} = $${values.length}`;
        });

        sql = `UPDATE ${tableUser} SET ${setClauses.join(", ")}`;
        sql += buildWhere();
        if (this._returning) sql += ` RETURNING *`;
        break;

      case "DELETE":
        if (this._joins.length > 0) throw new Error("DELETE does not support JOINS directly");
        sql = `DELETE FROM ${tableUser}`;
        sql += buildWhere();
        if (this._returning) sql += ` RETURNING *`;
        break;
    }

    return { sql, values };
  }
}

