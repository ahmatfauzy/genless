# Query Timeout

PawQL supports per-query timeouts to prevent long-running queries from blocking your application. If a query exceeds the configured timeout, it throws a `PawQLTimeoutError`.

## Basic Usage

```typescript
import { createDB } from 'pawql';

const db = createDB(schema, adapter);

// Set a 5-second timeout
const users = await db.query('users')
  .timeout(5000)
  .execute();
```

If the query takes longer than 5 seconds, a `PawQLTimeoutError` is thrown.

## How It Works

The `.timeout(ms)` method wraps the underlying query in a `Promise.race()` against a timer. When the timer fires first, the promise rejects with a `PawQLTimeoutError`.

**Important:** The timeout is a *client-side* mechanism. It does _not_ send a `CANCEL` to the database server. For server-side timeouts with PostgreSQL, you can use the `statement_timeout` pool option instead:

```typescript
// Assuming adapter is correctly configured with a statement_timeout option
const db = createDB(schema, new PostgresAdapter({
  connectionString: '...',
  statement_timeout: 5000,  // PostgreSQL server-side timeout
}));
```

## Supported Methods

The timeout applies to all query execution methods:

```typescript
// .execute()
await db.query('users').timeout(5000).execute();

// .first()
await db.query('users').timeout(5000).first();

// .count()
await db.query('users').timeout(5000).count();
```

## Error Handling

```typescript
import { PawQLTimeoutError } from 'pawql';

try {
  await db.query('users')
    .where({ name: { like: '%complex%' } })
    .timeout(1000)
    .execute();
} catch (e) {
  if (e instanceof PawQLTimeoutError) {
    console.log(e.timeoutMs);   // 1000
    console.log(e.sql);         // The SQL that timed out
    console.log(e.message);     // "Query timed out after 1000ms: SELECT * FROM ..."
  }
}
```

### `PawQLTimeoutError` Properties

| Property | Type | Description |
|----------|------|-------------|
| `timeoutMs` | `number` | The configured timeout in milliseconds |
| `sql` | `string` | The SQL query that timed out |
| `name` | `string` | Always `"PawQLTimeoutError"` |
| `message` | `string` | Human-readable message with duration and truncated SQL |

## Scope

Timeouts are **per-query**, not global:

```typescript
// This query has a timeout
await db.query('users').timeout(1000).execute();

// This query has NO timeout (unlimited)
await db.query('users').execute();
```

## Best Practices

1. **Use for user-facing queries** — Set reasonable timeouts on read queries to prevent slow pages.
2. **Combine with server-side timeouts** — For true cancellation, use `statement_timeout` in your PostgreSQL config.
3. **Log timed-out queries** — Catch `PawQLTimeoutError` and log the SQL for debugging.
4. **Don't use on transactions** — The timeout applies per-query, not per-transaction. For transaction-level timeouts, use server-side options.

## API Summary

| Method | Description |
|--------|-------------|
| `.timeout(ms)` | Set a per-query timeout in milliseconds |
| `PawQLTimeoutError` | Error class thrown on timeout |

See the [API Reference](./api-reference.md) for full type signatures.
