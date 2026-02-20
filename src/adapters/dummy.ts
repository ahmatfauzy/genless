
import { DatabaseAdapter, QueryResult } from "../core/adapter.js";

export class DummyAdapter implements DatabaseAdapter {
  private _logs: { sql: string; params: any[] }[] = [];

  constructor(logsRef?: { sql: string; params: any[] }[]) {
    if (logsRef) {
      this._logs = logsRef;
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    console.log(`[DummyAdapter] SQL: ${sql} Params:`, params);
    this._logs.push({ sql, params: params || [] });
    return {
      rows: [],
      rowCount: 0
    };
  }

  async transaction<T>(callback: (trx: DatabaseAdapter) => Promise<T>): Promise<T> {
    console.log("[DummyAdapter] transaction start");
    this._logs.push({ sql: 'BEGIN', params: [] });
    
    try {
      // Pass a new DummyAdapter that shares the same log reference
      // so we can assert on all logs in one place
      const trxAdapter = new DummyAdapter(this._logs);
      const result = await callback(trxAdapter);
      
      this._logs.push({ sql: 'COMMIT', params: [] });
      console.log("[DummyAdapter] transaction commit");
      return result;
    } catch (e) {
      this._logs.push({ sql: 'ROLLBACK', params: [] });
      console.log("[DummyAdapter] transaction rollback");
      throw e;
    }
  }

  async close(): Promise<void> {
    console.log("[DummyAdapter] Closing database connection.");
  }

  get logs() {
    return this._logs;
  }
}
