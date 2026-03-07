
import { test } from "node:test";
import assert from "node:assert";
import { createDB } from "../src/core/database.js";
import { HookRegistry } from "../src/core/hooks.js";
import { DummyAdapter } from "../src/testing.js";

// ============================================
// Test Schema
// ============================================

const schema = {
  users: {
    id: { type: Number, primaryKey: true },
    name: String,
    age: Number,
  },
  posts: {
    id: { type: Number, primaryKey: true },
    userId: Number,
    title: String,
  },
};

// ============================================
// HookRegistry — Unit Tests
// ============================================

test("HookRegistry — registers and runs a hook", async () => {
  const registry = new HookRegistry();
  const calls: string[] = [];

  registry.on("users", "beforeInsert", (ctx) => {
    calls.push(`beforeInsert:${ctx.table}`);
  });

  await registry.run("users", "beforeInsert", {
    table: "users",
    operation: "INSERT",
    data: { id: 1 },
  });

  assert.deepStrictEqual(calls, ["beforeInsert:users"]);
});

test("HookRegistry — wildcard hooks match all tables", async () => {
  const registry = new HookRegistry();
  const calls: string[] = [];

  registry.on("*", "afterInsert", (ctx) => {
    calls.push(`afterInsert:${ctx.table}`);
  });

  await registry.run("users", "afterInsert", { table: "users", operation: "INSERT" });
  await registry.run("posts", "afterInsert", { table: "posts", operation: "INSERT" });

  assert.deepStrictEqual(calls, ["afterInsert:users", "afterInsert:posts"]);
});

test("HookRegistry — multiple hooks run in order", async () => {
  const registry = new HookRegistry();
  const calls: number[] = [];

  registry.on("users", "beforeInsert", () => { calls.push(1); });
  registry.on("users", "beforeInsert", () => { calls.push(2); });
  registry.on("users", "beforeInsert", () => { calls.push(3); });

  await registry.run("users", "beforeInsert", { table: "users", operation: "INSERT" });

  assert.deepStrictEqual(calls, [1, 2, 3]);
});

test("HookRegistry — off removes hooks for table+event", () => {
  const registry = new HookRegistry();
  registry.on("users", "beforeInsert", () => {});
  registry.on("users", "afterInsert", () => {});
  registry.on("posts", "beforeInsert", () => {});

  registry.off("users", "beforeInsert");

  assert.strictEqual(registry.has("users", "beforeInsert"), false);
  assert.strictEqual(registry.has("users", "afterInsert"), true);
  assert.strictEqual(registry.has("posts", "beforeInsert"), true);
});

test("HookRegistry — off without event removes all hooks for table", () => {
  const registry = new HookRegistry();
  registry.on("users", "beforeInsert", () => {});
  registry.on("users", "afterInsert", () => {});

  registry.off("users");

  assert.strictEqual(registry.has("users", "beforeInsert"), false);
  assert.strictEqual(registry.has("users", "afterInsert"), false);
});

test("HookRegistry — clear removes everything", () => {
  const registry = new HookRegistry();
  registry.on("users", "beforeInsert", () => {});
  registry.on("posts", "afterInsert", () => {});

  registry.clear();

  assert.strictEqual(registry.hooks.length, 0);
});

test("HookRegistry — has returns correct result", () => {
  const registry = new HookRegistry();
  assert.strictEqual(registry.has("users", "beforeInsert"), false);

  registry.on("users", "beforeInsert", () => {});
  assert.strictEqual(registry.has("users", "beforeInsert"), true);
  assert.strictEqual(registry.has("users", "afterInsert"), false);
});

test("HookRegistry — async hooks are awaited", async () => {
  const registry = new HookRegistry();
  const calls: number[] = [];

  registry.on("users", "beforeInsert", async () => {
    await new Promise((r) => setTimeout(r, 10));
    calls.push(1);
  });
  registry.on("users", "beforeInsert", () => {
    calls.push(2);
  });

  await registry.run("users", "beforeInsert", { table: "users", operation: "INSERT" });

  assert.deepStrictEqual(calls, [1, 2]);
});

// ============================================
// db.hook() — Integration Tests
// ============================================

test("db.hook — beforeInsert is called", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeInsert", (ctx) => {
    calls.push(`beforeInsert:${ctx.table}`);
  });

  await db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();

  assert.deepStrictEqual(calls, ["beforeInsert:users"]);
});

test("db.hook — afterInsert is called with result", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const results: any[] = [];

  db.hook("users", "afterInsert", (ctx) => {
    results.push({ table: ctx.table, result: ctx.result });
  });

  await db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].table, "users");
  assert.ok(Array.isArray(results[0].result));
});

test("db.hook — beforeUpdate is called", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeUpdate", (ctx) => {
    calls.push(`beforeUpdate:${ctx.table}`);
  });

  await db.query("users").update({ name: "Bob" }).where({ id: 1 }).execute();

  assert.deepStrictEqual(calls, ["beforeUpdate:users"]);
});

test("db.hook — beforeDelete is called", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeDelete", (ctx) => {
    calls.push(`beforeDelete:${ctx.table}`);
  });

  await db.query("users").delete().where({ id: 1 }).execute();

  assert.deepStrictEqual(calls, ["beforeDelete:users"]);
});

test("db.hook — beforeSelect is called", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeSelect", (ctx) => {
    calls.push(`beforeSelect:${ctx.table}`);
  });

  await db.query("users").where({ id: 1 }).execute();

  assert.deepStrictEqual(calls, ["beforeSelect:users"]);
});

test("db.hook — afterSelect is called with result", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const results: any[] = [];

  db.hook("users", "afterSelect", (ctx) => {
    results.push(ctx.result);
  });

  await db.query("users").execute();

  assert.strictEqual(results.length, 1);
  assert.ok(Array.isArray(results[0]));
});

test("db.hook — beforeInsert can mutate data", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  db.hook("users", "beforeInsert", (ctx) => {
    if (ctx.data && !Array.isArray(ctx.data)) {
      (ctx.data as any).age = 99;
    }
  });

  await db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();

  // Check that the INSERT used age=99 (mutated by hook)
  const insertLog = adapter.logs.find((l) => l.sql.includes("INSERT"));
  assert.ok(insertLog);
  assert.ok(insertLog!.params.includes(99), "Hook should have mutated age to 99");
});

test("db.hook — global hook (*) fires for any table", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const tables: string[] = [];

  db.hook("*", "afterInsert", (ctx) => {
    tables.push(ctx.table);
  });

  await db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();
  await db.query("posts").insert({ id: 1, userId: 1, title: "Test" }).execute();

  assert.deepStrictEqual(tables, ["users", "posts"]);
});

test("db.hook — hook errors abort the operation", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);

  db.hook("users", "beforeInsert", () => {
    throw new Error("Blocked by hook!");
  });

  await assert.rejects(
    () => db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute(),
    (err: any) => {
      assert.strictEqual(err.message, "Blocked by hook!");
      return true;
    }
  );
});

test("db.unhook — removes hooks", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeInsert", () => { calls.push("should-not-fire"); });
  db.unhook("users", "beforeInsert");

  await db.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();

  assert.strictEqual(calls.length, 0);
});

test("db.hook — hooks are shared in transaction", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeInsert", (ctx) => {
    calls.push(`beforeInsert:${ctx.table}`);
  });

  await db.transaction(async (tx) => {
    await tx.query("users").insert({ id: 1, name: "Alice", age: 25 }).execute();
  });

  assert.deepStrictEqual(calls, ["beforeInsert:users"]);
});

test("db.hook — .first() triggers hooks", async () => {
  const adapter = new DummyAdapter();
  const db = createDB(schema, adapter);
  const calls: string[] = [];

  db.hook("users", "beforeSelect", () => { calls.push("before"); });
  db.hook("users", "afterSelect", () => { calls.push("after"); });

  await db.query("users").where({ id: 1 }).first();

  assert.deepStrictEqual(calls, ["before", "after"]);
});
