
/**
 * Interface for database adapters.
 * This allows PawQL to be database-agnostic while primarily targeting PostgreSQL first.
 */

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseAdapter {
  /**
   * Execute a raw SQL query with parameters.
   * @param sql The SQL string (use $1, $2, etc. for parameters)
   * @param params Verify that params match the placeholders
   */
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /**
   * Execute a callback within a database transaction.
   * @param callback Function to execute within the transaction scope
   */
  transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T>;

  /**
   * Disconnect from the database.
   */
  close(): Promise<void>;
}
