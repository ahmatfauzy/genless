# Hooks / Middleware

PawQL supports lifecycle hooks that run before and after database operations. Use hooks to implement cross-cutting concerns like timestamping, logging, auditing, validation, and access control.

## Quick Start

```typescript
import { createDB, PostgresAdapter } from 'pawql';

const db = createDB(schema, adapter);

// Auto-add timestamps
db.hook('users', 'beforeInsert', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.createdAt = new Date();
  }
});

// Log all inserts
db.hook('*', 'afterInsert', (ctx) => {
  console.log(`✓ Inserted into ${ctx.table}`);
});

// Now all inserts on "users" will have createdAt automatically set
await db.query('users').insert({ id: 1, name: 'Alice' }).execute();
```

## Supported Events

| Event | When it fires |
|-------|---------------|
| `beforeInsert` | Before INSERT is executed |
| `afterInsert` | After INSERT completes |
| `beforeUpdate` | Before UPDATE is executed |
| `afterUpdate` | After UPDATE completes |
| `beforeDelete` | Before DELETE is executed |
| `afterDelete` | After DELETE completes |
| `beforeSelect` | Before SELECT is executed |
| `afterSelect` | After SELECT completes |

## Registering Hooks

### Per-table

```typescript
db.hook('users', 'beforeInsert', (ctx) => {
  // Only fires for the "users" table
});
```

### Global (all tables)

```typescript
db.hook('*', 'afterInsert', (ctx) => {
  // Fires for every table
  console.log(`Inserted into ${ctx.table}`);
});
```

### Multiple hooks on the same event

Hooks are executed in registration order:

```typescript
db.hook('users', 'beforeInsert', (ctx) => {
  console.log('First hook');
});

db.hook('users', 'beforeInsert', (ctx) => {
  console.log('Second hook');
});

// Output: "First hook", then "Second hook"
```

## Hook Context

Every hook receives a `HookContext` object:

```typescript
interface HookContext<T = any> {
  table: string;           // The table name
  operation: string;       // "INSERT" | "UPDATE" | "DELETE" | "SELECT"
  data?: Partial<T>;       // The data being written (before* hooks for INSERT/UPDATE)
  result?: T[];            // The rows returned (after* hooks)
}
```

## Mutating Data in Hooks

`before*` hooks for INSERT and UPDATE can modify the `ctx.data` object:

```typescript
// Auto-set timestamps
db.hook('users', 'beforeInsert', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.createdAt = new Date();
    ctx.data.updatedAt = new Date();
  }
});

db.hook('users', 'beforeUpdate', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.updatedAt = new Date();
  }
});
```

## Aborting Operations

Throwing an error inside a `before*` hook aborts the operation:

```typescript
db.hook('users', 'beforeDelete', (ctx) => {
  throw new Error('Deleting users is not allowed!');
});

// This will throw: "Deleting users is not allowed!"
await db.query('users').delete().where({ id: 1 }).execute();
```

## Async Hooks

Hooks can be asynchronous:

```typescript
db.hook('orders', 'afterInsert', async (ctx) => {
  await sendNotification(`New order created: ${ctx.table}`);
});
```

Async hooks are properly awaited before proceeding.

## Removing Hooks

```typescript
// Remove a specific event for a table
db.unhook('users', 'beforeInsert');

// Remove ALL hooks for a table
db.unhook('users');

// Clear all hooks everywhere
db.hookRegistry.clear();
```

## Transactions

Hooks are automatically shared with transaction scopes:

```typescript
db.hook('users', 'beforeInsert', (ctx) => {
  console.log('This fires inside the transaction too!');
});

await db.transaction(async (tx) => {
  // Hook fires here
  await tx.query('users').insert({ id: 1, name: 'Alice' }).execute();
});
```

## HookRegistry (Advanced)

For more advanced use cases, access the `HookRegistry` directly:

```typescript
import { HookRegistry } from 'pawql';

const registry = new HookRegistry();

// Register
registry.on('users', 'beforeInsert', (ctx) => { ... });

// Check if hooks exist
registry.has('users', 'beforeInsert'); // true

// Inspect all hooks
console.log(registry.hooks); // ReadonlyArray<HookEntry>

// Remove specific event
registry.off('users', 'beforeInsert');

// Clear everything
registry.clear();
```

## Use Cases

### Automatic Timestamps

```typescript
db.hook('*', 'beforeInsert', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.createdAt = new Date();
  }
});

db.hook('*', 'beforeUpdate', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data)) {
    ctx.data.updatedAt = new Date();
  }
});
```

### Audit Logging

```typescript
db.hook('*', 'afterInsert', async (ctx) => {
  await db.query('audit_logs').insert({
    table: ctx.table, action: 'INSERT', timestamp: new Date(),
  }).execute();
});
```

### Input Sanitization

```typescript
db.hook('users', 'beforeInsert', (ctx) => {
  if (ctx.data && !Array.isArray(ctx.data) && typeof ctx.data.email === 'string') {
    ctx.data.email = ctx.data.email.toLowerCase().trim();
  }
});
```

### Access Control

```typescript
db.hook('admin_settings', 'beforeUpdate', (ctx) => {
  if (!currentUser.isAdmin) {
    throw new Error('Only admins can modify settings');
  }
});
```

## API Summary

| Method | Description |
|--------|-------------|
| `db.hook(table, event, callback)` | Register a lifecycle hook |
| `db.unhook(table, event?)` | Remove hooks |
| `db.hookRegistry` | Access the `HookRegistry` directly |

| Type | Description |
|------|-------------|
| `HookEvent` | Union of all lifecycle events |
| `HookCallback` | The hook function type |
| `HookContext` | Context object passed to hooks |
| `HookRegistry` | The registry class for advanced usage |

See the [API Reference](./api-reference.md) for full type signatures.
