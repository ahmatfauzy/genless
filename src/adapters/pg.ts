import { Pool, PoolClient, PoolConfig, QueryResult as PgQueryResult } from "pg";
import { DatabaseAdapter, QueryResult } from "../core/adapter.js";

export class PostgresAdapter implements DatabaseAdapter {
  private pool: Pool | null = null;
  private client: PoolClient | null = null;

  constructor(configOrPool: PoolConfig | Pool | PoolClient) {
    if (configOrPool instanceof Pool) {
      this.pool = configOrPool;
    } else if ((configOrPool as any).release && (configOrPool as any).query) {
       // Check for PoolClient-like object (duck typing or instance check if possible)
       // Since PoolClient class isn't easily instantiable for instanceof check without connection, 
       // we assume it's a client if it has release.
       this.client = configOrPool as PoolClient;
    } else {
      this.pool = new Pool(configOrPool as PoolConfig);
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const executor = this.client || this.pool;
    if (!executor) throw new Error("Adapter is closed or invalid");

    const result = await executor.query(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0
    };
  }

  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    if (this.client) {
      // Already in a transaction (nested transaction)
      // For MVP, we can just execute the callback with the current client.
      // Ideally we would use SAVEPOINT for nested transactions.
      return callback(this);
    }

    if (!this.pool) throw new Error("Cannot start transaction without a pool");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      
      // Create a temporary adapter sharing this client
      const trxAdapter = new PostgresAdapter(client);
      
      const result = await callback(trxAdapter);
      
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    // Clients are released, not closed directly usually, but if we owned it we might need to strictly ensure.
  }
}
