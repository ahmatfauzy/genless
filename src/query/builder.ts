
import { DatabaseAdapter } from "../core/adapter";
import { TableSchema, InferTableType } from "../types/schema";

type WhereOperator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IN";

interface WhereClause<T> {
  column: keyof T;
  operator: WhereOperator;
  value: any;
}

// Operation types
type Operation = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

export class QueryBuilder<TTable extends Record<string, any>, TResult = TTable> {
  private _table: string;
  private _adapter: DatabaseAdapter;
  private _operation: Operation = 'SELECT';
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

  /**
   * Insert new record(s).
   * @param data Single object or array of objects to insert.
   */
  insert(data: Partial<TTable> | Partial<TTable>[]): this {
    this._operation = 'INSERT';
    this._data = data;
    this._returning = true; // Default to returning inserted rows for convenience
    return this;
  }

  /**
   * Update existing record(s).
   * @param data Object with fields to update.
   */
  update(data: Partial<TTable>): this {
    this._operation = 'UPDATE';
    this._data = data;
    this._returning = true; // Default to returning updated rows
    return this;
  }

  /**
   * Delete record(s).
   */
  delete(): this {
    this._operation = 'DELETE';
    this._returning = true; // Default to returning deleted rows
    return this;
  }

  // --- Clauses ---

  /**
   * Specify columns to select or return.
   * If not called, defaults to * (all columns).
   */
  select<K extends keyof TTable>(...columns: K[]): QueryBuilder<TTable, Pick<TTable, K>> {
    this._select = columns;
    // We return a new instance (or cast existing) with the new result type
    return this as unknown as QueryBuilder<TTable, Pick<TTable, K>>;
  }

  /**
   * Add a WHERE condition.
   * Supports filtering on any column of the original table.
   */
  where<K extends keyof TTable>(column: K, operator: WhereOperator, value: TTable[K]): this {
    this._where.push({ column, operator, value });
    return this;
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

  /**
   * Execute the query and return the results.
   */
  async execute(): Promise<TResult[]> {
    const { sql, values } = this.toSQL();
    const result = await this._adapter.query<TResult>(sql, values);
    return result.rows;
  }

  /**
   * Enable await-ing the query builder directly.
   */
  then<TResult1 = TResult[], TResult2 = never>(
    onfulfilled?: ((value: TResult[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  /**
   * Generate the SQL string and parameters.
   */
  toSQL(): { sql: string; values: any[] } {
    const columns = this._select.length > 0 ? this._select.join(", ") : "*";
    const values: any[] = [];
    let sql = "";

    switch (this._operation) {
        case 'SELECT':
            sql = `SELECT ${columns} FROM ${this._table}`;
            if (this._where.length > 0) {
                const clauses = this._where.map((clause) => {
                    values.push(clause.value);
                    return `${String(clause.column)} ${clause.operator} $${values.length}`;
                });
                sql += ` WHERE ${clauses.join(" AND ")}`;
            }
            break;

        case 'INSERT':
            if (!this._data) throw new Error("No data provided for INSERT");
            const dataArr = Array.isArray(this._data) ? this._data : [this._data];
            if (dataArr.length === 0) throw new Error("Empty data array for INSERT");
            
            // TS doesn't know that Partial<TTable> has keys if it's generic, but at runtime it does.
            // We cast to any to get keys.
            const firstRow = dataArr[0] as any;
            const keys = Object.keys(firstRow);
            if (keys.length === 0) throw new Error("No columns to insert");

            const placeHolders: string[] = [];
            dataArr.forEach(row => {
                const rowPlaceholders: string[] = [];
                keys.forEach(key => {
                    values.push((row as any)[key]);
                    rowPlaceholders.push(`$${values.length}`);
                });
                placeHolders.push(`(${rowPlaceholders.join(", ")})`);
            });

            sql = `INSERT INTO ${this._table} (${keys.join(", ")}) VALUES ${placeHolders.join(", ")}`;
            if (this._returning) sql += ` RETURNING ${columns}`;
            break;

        case 'UPDATE':
            if (!this._data) throw new Error("No data provided for UPDATE");
            const updateKeys = Object.keys(this._data);
            if (updateKeys.length === 0) throw new Error("No columns to update");

            const setClauses = updateKeys.map((key) => {
                values.push((this._data as any)[key]);
                return `${key} = $${values.length}`;
            });

            sql = `UPDATE ${this._table} SET ${setClauses.join(", ")}`;
            
            if (this._where.length > 0) {
                const clauses = this._where.map((clause) => {
                    values.push(clause.value);
                    return `${String(clause.column)} ${clause.operator} $${values.length}`;
                });
                sql += ` WHERE ${clauses.join(" AND ")}`;
            }
            
            if (this._returning) sql += ` RETURNING ${columns}`;
            break;

        case 'DELETE':
            sql = `DELETE FROM ${this._table}`;
            
            if (this._where.length > 0) {
                const clauses = this._where.map((clause) => {
                    values.push(clause.value);
                    return `${String(clause.column)} ${clause.operator} $${values.length}`;
                });
                sql += ` WHERE ${clauses.join(" AND ")}`;
            }
            
            if (this._returning) sql += ` RETURNING ${columns}`;
            break;
    }

    if (this._operation === 'SELECT') {
        if (this._limit !== undefined) {
             sql += ` LIMIT ${this._limit}`;
        }
    
        if (this._offset !== undefined) {
          sql += ` OFFSET ${this._offset}`;
        }
    }

    return { sql, values };
  }
}

