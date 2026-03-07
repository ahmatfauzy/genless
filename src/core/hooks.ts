
/**
 * PawQL Hooks / Middleware System.
 *
 * Register lifecycle hooks on tables to run logic before or after
 * INSERT, UPDATE, DELETE, and SELECT operations.
 *
 * @module hooks
 */

/**
 * The lifecycle event names that hooks can be registered for.
 */
export type HookEvent =
  | "beforeInsert"
  | "afterInsert"
  | "beforeUpdate"
  | "afterUpdate"
  | "beforeDelete"
  | "afterDelete"
  | "beforeSelect"
  | "afterSelect";

/**
 * Context object passed to every hook callback.
 * Contains the table name, the operation type, and the relevant data.
 */
export interface HookContext<T = any> {
  /** The table name this hook is running for. */
  table: string;

  /** The operation being performed. */
  operation: "INSERT" | "UPDATE" | "DELETE" | "SELECT";

  /**
   * The data being inserted/updated (for write hooks).
   * For `beforeInsert` / `beforeUpdate`, this can be mutated to transform data before execution.
   * For `afterInsert` / `afterUpdate`, this is the original data that was sent.
   */
  data?: Partial<T> | Partial<T>[];

  /**
   * The rows returned by the query (only available in `after*` hooks).
   */
  result?: T[];
}

/**
 * A hook callback function.
 * Can be synchronous or asynchronous.
 *
 * For `before*` hooks, the context's `data` can be mutated to transform values.
 * Throwing an error inside a hook will abort the operation.
 */
export type HookCallback<T = any> = (context: HookContext<T>) => void | Promise<void>;

/**
 * A registered hook entry — stores the event, table filter, and callback.
 * @internal
 */
export interface HookEntry {
  event: HookEvent;
  table: string | "*";
  callback: HookCallback;
}

/**
 * Manages lifecycle hooks for PawQL database operations.
 *
 * Hooks can be registered per-table or globally (using `'*'`).
 * Multiple hooks per event are supported and run in registration order.
 *
 * @example
 * ```typescript
 * const hooks = new HookRegistry();
 *
 * hooks.on('users', 'beforeInsert', (ctx) => {
 *   // Automatically set createdAt
 *   if (ctx.data && !Array.isArray(ctx.data)) {
 *     ctx.data.createdAt = new Date();
 *   }
 * });
 *
 * hooks.on('*', 'afterInsert', (ctx) => {
 *   console.log(`Inserted into ${ctx.table}`);
 * });
 * ```
 */
export class HookRegistry {
  private _hooks: HookEntry[] = [];

  /**
   * Register a hook for a specific table and event.
   *
   * @param table - The table name, or `'*'` for all tables
   * @param event - The lifecycle event to hook into
   * @param callback - The function to run when the event fires
   *
   * @example
   * ```typescript
   * hooks.on('users', 'beforeInsert', (ctx) => {
   *   console.log('Inserting into users:', ctx.data);
   * });
   * ```
   */
  on(table: string, event: HookEvent, callback: HookCallback): void {
    this._hooks.push({ event, table, callback });
  }

  /**
   * Remove all hooks matching the given table and event.
   * If only `table` is provided, removes all hooks for that table.
   *
   * @param table - The table name or `'*'`
   * @param event - Optional event filter
   */
  off(table: string, event?: HookEvent): void {
    this._hooks = this._hooks.filter((h) => {
      if (event) {
        return !(h.table === table && h.event === event);
      }
      return h.table !== table;
    });
  }

  /**
   * Remove all registered hooks.
   */
  clear(): void {
    this._hooks = [];
  }

  /**
   * Run all matching hooks for a given table and event.
   *
   * @param table - The table name
   * @param event - The lifecycle event
   * @param context - The hook context object
   * @internal
   */
  async run(table: string, event: HookEvent, context: HookContext): Promise<void> {
    const matching = this._hooks.filter(
      (h) => h.event === event && (h.table === table || h.table === "*")
    );

    for (const hook of matching) {
      await hook.callback(context);
    }
  }

  /**
   * Check if any hooks are registered for a specific table and event.
   *
   * @param table - The table name
   * @param event - The lifecycle event
   * @returns `true` if at least one hook is registered
   */
  has(table: string, event: HookEvent): boolean {
    return this._hooks.some(
      (h) => h.event === event && (h.table === table || h.table === "*")
    );
  }

  /**
   * Get all registered hooks (for inspection/debugging).
   */
  get hooks(): ReadonlyArray<HookEntry> {
    return this._hooks;
  }
}
