
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import {
  hasMany,
  belongsTo,
  hasOne,
  defineRelations,
  RelationManager,
} from "../src/core/relations.js";
import { DummyAdapter } from "../src/testing.js";

// ============================================
// Test Schema
// ============================================

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
  comments: {
    id: { type: Number, primaryKey: true },
    postId: Number,
    body: String,
  },
};

// ============================================
// Relation Helpers — Unit Tests
// ============================================

test("hasMany — creates correct definition", () => {
  const rel = hasMany("posts", "userId");
  assert.strictEqual(rel.type, "hasMany");
  assert.strictEqual(rel.to, "posts");
  assert.strictEqual(rel.foreignKey, "userId");
  assert.strictEqual(rel.localKey, "id");
});

test("hasMany — custom localKey", () => {
  const rel = hasMany("posts", "userId", "customId");
  assert.strictEqual(rel.localKey, "customId");
});

test("belongsTo — creates correct definition", () => {
  const rel = belongsTo("users", "userId");
  assert.strictEqual(rel.type, "belongsTo");
  assert.strictEqual(rel.to, "users");
  assert.strictEqual(rel.foreignKey, "userId");
  assert.strictEqual(rel.localKey, "id");
});

test("hasOne — creates correct definition", () => {
  const rel = hasOne("profiles", "userId");
  assert.strictEqual(rel.type, "hasOne");
  assert.strictEqual(rel.to, "profiles");
  assert.strictEqual(rel.foreignKey, "userId");
  assert.strictEqual(rel.localKey, "id");
});

// ============================================
// defineRelations
// ============================================

test("defineRelations — resolves from field", () => {
  const relations = defineRelations({
    users: {
      posts: hasMany("posts", "userId"),
    },
    posts: {
      author: belongsTo("users", "userId"),
    },
  });

  assert.strictEqual(relations.users!.posts!.from, "users");
  assert.strictEqual(relations.posts!.author!.from, "posts");
});

// ============================================
// RelationManager
// ============================================

test("RelationManager — get returns relation", () => {
  const relations = defineRelations({
    users: { posts: hasMany("posts", "userId") },
  });
  const manager = new RelationManager(relations);

  const rel = manager.get("users", "posts");
  assert.ok(rel);
  assert.strictEqual(rel!.type, "hasMany");
});

test("RelationManager — get returns undefined for missing", () => {
  const relations = defineRelations({});
  const manager = new RelationManager(relations);

  assert.strictEqual(manager.get("users", "posts"), undefined);
});

test("RelationManager — getAll returns all relations", () => {
  const relations = defineRelations({
    users: {
      posts: hasMany("posts", "userId"),
      profile: hasOne("profiles", "userId"),
    },
  });
  const manager = new RelationManager(relations);

  const all = manager.getAll("users");
  assert.ok(all);
  assert.ok("posts" in all!);
  assert.ok("profile" in all!);
});

test("RelationManager — resolveJoin for hasMany", () => {
  const relations = defineRelations({
    users: { posts: hasMany("posts", "userId") },
  });
  const manager = new RelationManager(relations);

  const join = manager.resolveJoin("users", "posts");
  assert.ok(join);
  assert.strictEqual(join!.joinTable, "posts");
  assert.strictEqual(join!.col1, "users.id");
  assert.strictEqual(join!.op, "=");
  assert.strictEqual(join!.col2, "posts.userId");
  assert.strictEqual(join!.joinType, "LEFT");
});

test("RelationManager — resolveJoin for belongsTo", () => {
  const relations = defineRelations({
    posts: { author: belongsTo("users", "userId") },
  });
  const manager = new RelationManager(relations);

  const join = manager.resolveJoin("posts", "author");
  assert.ok(join);
  assert.strictEqual(join!.joinTable, "users");
  assert.strictEqual(join!.col1, "posts.userId");
  assert.strictEqual(join!.op, "=");
  assert.strictEqual(join!.col2, "users.id");
  assert.strictEqual(join!.joinType, "LEFT");
});

test("RelationManager — resolveJoin for hasOne", () => {
  const relations = defineRelations({
    users: { profile: hasOne("profiles", "userId") },
  });
  const manager = new RelationManager(relations);

  const join = manager.resolveJoin("users", "profile");
  assert.ok(join);
  assert.strictEqual(join!.joinTable, "profiles");
  assert.strictEqual(join!.col1, "users.id");
  assert.strictEqual(join!.op, "=");
  assert.strictEqual(join!.col2, "profiles.userId");
});

test("RelationManager — resolveJoin returns null for unknown", () => {
  const relations = defineRelations({});
  const manager = new RelationManager(relations);

  assert.strictEqual(manager.resolveJoin("users", "nothing"), null);
});

// ============================================
// db.query().with() — Integration Tests
// ============================================

test("with() — generates LEFT JOIN for hasMany", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    users: { posts: hasMany("posts", "userId") },
  });
  const db = createDB(schema, adapter, { relations });

  await db.query("users").with("posts").execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT * FROM "users" LEFT JOIN "posts" ON "users"."id" = "posts"."userId"'
  );
});

test("with() — generates LEFT JOIN for belongsTo", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    posts: { author: belongsTo("users", "userId") },
  });
  const db = createDB(schema, adapter, { relations });

  await db.query("posts").with("author").execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT * FROM "posts" LEFT JOIN "users" ON "posts"."userId" = "users"."id"'
  );
});

test("with() — generates LEFT JOIN for hasOne", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    users: { profile: hasOne("profiles", "userId") },
  });
  const db = createDB(schema, adapter, { relations });

  await db.query("users").with("profile").execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.strictEqual(
    lastLog.sql,
    'SELECT * FROM "users" LEFT JOIN "profiles" ON "users"."id" = "profiles"."userId"'
  );
});

test("with() — multiple relations", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    users: {
      posts: hasMany("posts", "userId"),
      profile: hasOne("profiles", "userId"),
    },
  });
  const db = createDB(schema, adapter, { relations });

  await db.query("users").with("posts").with("profile").execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('LEFT JOIN "posts"'));
  assert.ok(lastLog.sql.includes('LEFT JOIN "profiles"'));
});

test("with() — combined with .where()", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    users: { posts: hasMany("posts", "userId") },
  });
  const db = createDB(schema, adapter, { relations });

  await db
    .query("users")
    .with("posts")
    .where({ name: "Alice" })
    .execute();

  const lastLog = adapter.logs[adapter.logs.length - 1]!;
  assert.ok(lastLog.sql.includes('LEFT JOIN "posts"'));
  assert.ok(lastLog.sql.includes('WHERE "name" = $1'));
  assert.deepStrictEqual(lastLog.params, ["Alice"]);
});

test("with() — throws for unknown relation", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({});
  const db = createDB(schema, adapter, { relations });

  assert.throws(
    () => db.query("users").with("nonexistent"),
    (err: any) => {
      assert.ok(err.message.includes('nonexistent'));
      assert.ok(err.message.includes('users'));
      return true;
    }
  );
});

test("with() — throws when no relations defined", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter); // No relations option

  assert.throws(
    () => db.query("users").with("posts"),
    (err: any) => {
      assert.ok(err.message.includes("no relations defined"));
      return true;
    }
  );
});

test("with() — works in transaction", async () => {
  const adapter = new DummyAdapter();
  const relations = defineRelations({
    users: { posts: hasMany("posts", "userId") },
  });
  const db = createDB(schema, adapter, { relations });

  await db.transaction(async (tx) => {
    await tx.query("users").with("posts").execute();
  });

  const selectLog = adapter.logs.find((l) => l.sql.includes("LEFT JOIN"));
  assert.ok(selectLog);
  assert.ok(selectLog!.sql.includes('"posts"'));
});
