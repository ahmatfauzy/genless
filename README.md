# PawQL

**The Runtime-First ORM for TypeScript** that requires **no code generation** and **no build step**.

PawQL is a modern, type-safe database query builder designed for speed and simplicity. It infers types directly from your runtime schema definition, eliminating the need for complex CLI tools or separate schema files.

## Features

- 🚀 **Runtime-First**: Define schema as standard JavaScript objects.
- 🔒 **Type Safety**: Full TypeScript inference without code generation.
- 🛠️ **Zero Config**: No CLI, no `schema.prisma`, no generated files.
- ⚡ **Lightweight**: Minimal runtime overhead, perfect for Serverless/Edge.
- 📦 **Modern Stack**: Built for TypeScript & Node.js (Bun compatible).

### Supported Capabilities (v0.2.0)
- **CRUD**: Full `SELECT`, `INSERT`, `UPDATE`, `DELETE` support.
- **Filtering**: Advanced `WHERE` clauses with `AND`, `OR`, `IN`, `LIKE`, `IS NULL`, comparison operators.
- **Schema Sync**: Auto-generate tables with `db.createTables()` (DDL).
- **Data Types**: `String`, `Number`, `Boolean`, `Date`, **`JSON`**, **`UUID`**, **`Enum`**, **`Array`**.
- **Joins**: `INNER`, `LEFT`, `RIGHT`, `FULL` JOIN with full type inference.
- **Transactions**: Atomic operations with automatic rollback on error.
- **SQL Safety**: Automatic identifier quoting for reserved keywords.
- **Database**: PostgreSQL (via `pg`).

## Installation

COMINGSOON

<!-- ```bash
# Install PawQL and PostgreSQL driver
npm install pawql pg

# or using Bun
bun add pawql pg
```

> **Note**: `pg` is a peer dependency. -->

## Quick Start

### 1. Define Your Schema

Use standard JS constructors or helper functions for advanced types.

```typescript
import { createDB, PostgresAdapter, uuid, json, enumType, arrayType } from 'pawql';

const db = createDB({
  users: {
    id: uuid,                          // UUID type
    name: String,                      // TEXT
    email: { type: String, nullable: true },
    role: enumType('admin', 'user'),   // Check constraint
    tags: arrayType(String),           // TEXT[]
    metadata: json<{ lastLogin: string }>(), // JSONB with TS generic
    isActive: { type: Boolean, default: true }
  },
  posts: {
    id: { type: Number, primaryKey: true },
    user_id: Number,
    title: String,
    content: String,
  }
}, new PostgresAdapter({ connectionString: process.env.DATABASE_URL }));
```

### 2. Synchronize Database (DDL)

No migration tools needed for prototyping. Just run:

```typescript
// Creates tables if they don't exist
await db.createTables();
console.log("Database initialized!");
```

### 3. Query Your Data

Enjoy full autocompletion and type checking on results.

```typescript
// A. INSERT
const newUser = await db.query('users').insert({
  id: crypto.randomUUID(),
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
  tags: ['developer', 'typescript'],
  metadata: { lastLogin: new Date().toISOString() }
}).execute();

// B. SELECT with Type Inference
const admins = await db.query('users')
  .select('id', 'name', 'email')
  .where({ 
    role: 'admin',
    isActive: true 
  })
  .limit(10)
  .execute();
// Result: { id: string, name: string, email: string }[]

// C. ADVANCED FILTERING
const search = await db.query('users')
  .where({
    name: { like: '%Alice%' },         // LIKE
    role: { in: ['admin', 'super'] },  // IN
  })
  .orWhere({
    tags: { in: ['contributor'] }      // OR condition
  })
  .execute();

// D. TRANSACTIONS
await db.transaction(async (tx) => {
  const user = await tx.query('users').insert({ 
    id: crypto.randomUUID(), 
    name: 'Bob',
    role: 'user',
    tags: [],
    metadata: { lastLogin: '' }
  }).execute();
  // If anything fails here, everything rolls back automatically!
});

// E. JOINS
const userPosts = await db.query('users')
  .innerJoin('posts', 'users.id', '=', 'posts.user_id')
  .select('users.name', 'posts.title')
  .where({ 'users.isActive': true })
  .execute();
// Result type is automatically inferred from both tables!
```

## Philosophy

Most ORMs require a separate schema definition language (Prisma, Drizzle) or complex build steps. **PawQL** aims to be the query builder that just works with your runtime code, providing full type safety through TypeScript inference.

## License

MIT
