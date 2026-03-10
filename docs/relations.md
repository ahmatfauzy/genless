# Relations

PawQL supports defining relationships between tables for automatic joins. Define `hasMany`, `belongsTo`, and `hasOne` relations once, then use `.with()` to auto-join without writing join conditions manually.

## Quick Start

```typescript
import { createDB, defineRelations, hasMany, belongsTo, hasOne } from 'pawql';

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
  },
  profiles: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    bio: String,
  },
};

// Define relations
const relations = defineRelations({
  users: {
    posts: hasMany('posts', 'userId'),
    profile: hasOne('profiles', 'userId'),
  },
  posts: {
    author: belongsTo('users', 'userId'),
  },
});

// Pass relations to createDB
const db = createDB(schema, adapter, { relations });

// Auto-join: users with their posts
await db.query('users').with('posts').execute();
// → SELECT * FROM "users" LEFT JOIN "posts" ON "users"."id" = "posts"."userId"

// Auto-join: posts with their author
await db.query('posts').with('author').execute();
// → SELECT * FROM "posts" LEFT JOIN "users" ON "posts"."userId" = "users"."id"
```

## Relation Types

### `hasMany(to, foreignKey, localKey?)`

The current table has many rows in the target table.

```typescript
// users has many posts (posts.userId → users.id)
hasMany('posts', 'userId')
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `to` | `string` | — | Target table name |
| `foreignKey` | `string` | — | Column on the target table referencing this table |
| `localKey` | `string` | `'id'` | Column on this table being referenced |

**Generated SQL:**
```sql
LEFT JOIN "posts" ON "users"."id" = "posts"."userId"
```

### `belongsTo(to, foreignKey, localKey?)`

The current table has a foreign key pointing to the target table.

```typescript
// posts belongs to users (posts.userId → users.id)
belongsTo('users', 'userId')
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `to` | `string` | — | Target table name |
| `foreignKey` | `string` | — | Column on *this* table referencing the target |
| `localKey` | `string` | `'id'` | Column on the target table being referenced |

**Generated SQL:**
```sql
LEFT JOIN "users" ON "posts"."userId" = "users"."id"
```

### `hasOne(to, foreignKey, localKey?)`

The current table has exactly one related row in the target table.

```typescript
// users has one profile (profiles.userId → users.id)
hasOne('profiles', 'userId')
```

Works the same as `hasMany` but conceptually indicates a 1:1 relationship.

**Generated SQL:**
```sql
LEFT JOIN "profiles" ON "users"."id" = "profiles"."userId"
```

## `defineRelations()`

Call `defineRelations()` to build a resolved relation map. This automatically sets the `from` field on each relation definition.

```typescript
const relations = defineRelations({
  users: {
    posts: hasMany('posts', 'userId'),
    profile: hasOne('profiles', 'userId'),
  },
  posts: {
    author: belongsTo('users', 'userId'),
    comments: hasMany('comments', 'postId'),
  },
});
```

## Using `.with()` for Auto-Joins

The `.with()` method on the query builder automatically generates the correct JOIN:

```typescript
// Single relation
await db.query('users').with('posts').execute();

// Multiple relations
await db.query('users')
  .with('posts')
  .with('profile')
  .execute();
// → SELECT * FROM "users"
//   LEFT JOIN "posts" ON "users"."id" = "posts"."userId"
//   LEFT JOIN "profiles" ON "users"."id" = "profiles"."userId"

// Combined with other query methods
await db.query('users')
  .with('posts')
  .where({ name: 'Alice' })
  .orderBy('name', 'ASC')
  .limit(10)
  .execute();
```

## Custom Local Key

By default, the local key is `'id'`. You can override it:

```typescript
hasMany('posts', 'userId', 'customId')
// → LEFT JOIN "posts" ON "users"."customId" = "posts"."userId"
```

## Error Handling

### No relations defined

```typescript
// Throws if createDB was called without { relations: ... }
db.query('users').with('posts');
// Error: Cannot use .with('posts') — no relations defined.
```

### Unknown relation

```typescript
// Throws if the relation name doesn't exist
db.query('users').with('nonexistent');
// Error: Relation "nonexistent" not found on table "users".
```

## Transactions

Relations work seamlessly inside transactions:

```typescript
await db.transaction(async (tx) => {
  const usersWithPosts = await tx.query('users')
    .with('posts')
    .execute();
});
```

## RelationManager (Advanced)

For programmatic access, use the `RelationManager`:

```typescript
import { RelationManager, defineRelations, hasMany } from 'pawql';

const relations = defineRelations({
  users: { posts: hasMany('posts', 'userId') },
});

const manager = new RelationManager(relations);

// Get a specific relation
const rel = manager.get('users', 'posts');
// { type: 'hasMany', from: 'users', to: 'posts', foreignKey: 'userId', localKey: 'id' }

// Get all relations for a table
const all = manager.getAll('users');

// Resolve to JOIN parameters
const join = manager.resolveJoin('users', 'posts');
// { joinTable: 'posts', col1: 'users.id', op: '=', col2: 'posts.userId', joinType: 'LEFT' }
```

## API Summary

| Function | Description |
|----------|-------------|
| `hasMany(to, foreignKey, localKey?)` | Define a one-to-many relation |
| `belongsTo(to, foreignKey, localKey?)` | Define a many-to-one relation |
| `hasOne(to, foreignKey, localKey?)` | Define a one-to-one relation |
| `defineRelations(schema)` | Build a resolved relation map |
| `.with(relationName)` | Auto-join using a defined relation |

| Type | Description |
|------|-------------|
| `RelationType` | `'hasMany' \| 'belongsTo' \| 'hasOne'` |
| `RelationDefinition` | Full relation definition object |
| `RelationsSchema` | Table → relation map |
| `RelationManager` | Runtime relation resolver |

See the [API Reference](./api-reference.md) for full type signatures.
