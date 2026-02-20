
import { test, expect } from "bun:test";
import { createDB } from "../src/core/database";
import { DummyAdapter } from "../src/adapters/dummy";
import { json, uuid, enumType, arrayType } from "../src/types/schema";

// ============================================
// Type Inference Tests (compile-time checks)
// ============================================

test("Data Types - JSON type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    products: {
      id: Number,
      metadata: json<{ tags: string[]; color: string }>(),
    }
  }, adapter);

  // This test primarily validates that the code compiles.
  // At runtime, just verify the schema is stored correctly.
  const schema = db.schema;
  expect(schema.products.metadata).toBeDefined();
  expect(schema.products.metadata._brand).toBe("json");
});

test("Data Types - UUID type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: uuid,
      name: String,
    }
  }, adapter);

  expect(db.schema.users.id._brand).toBe("uuid");
});

test("Data Types - Enum type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: Number,
      role: enumType('admin', 'user', 'guest'),
    }
  }, adapter);

  expect(db.schema.users.role._brand).toBe("enum");
  expect(db.schema.users.role.values).toEqual(['admin', 'user', 'guest']);
});

test("Data Types - Array type inference", () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    posts: {
      id: Number,
      tags: arrayType(String),
    }
  }, adapter);

  expect(db.schema.posts.tags._brand).toBe("array");
  expect(db.schema.posts.tags.itemType).toBe(String);
});

// ============================================
// DDL Generation Tests
// ============================================

test("DDL - JSON column generates JSONB", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    products: {
      id: { type: Number, primaryKey: true },
      metadata: json<{ tags: string[] }>(),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0].sql;
  expect(sql).toContain("metadata JSONB NOT NULL");
});

test("DDL - UUID column generates UUID", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: uuid,
      name: String,
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0].sql;
  expect(sql).toContain("id UUID NOT NULL");
});

test("DDL - Enum column generates TEXT with CHECK", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    users: {
      id: { type: Number, primaryKey: true },
      role: enumType('admin', 'user', 'guest'),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0].sql;
  expect(sql).toContain("role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'guest'))");
});

test("DDL - Array column generates TYPE[]", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    posts: {
      id: { type: Number, primaryKey: true },
      tags: arrayType(String),
      scores: arrayType(Number),
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0].sql;
  expect(sql).toContain("tags TEXT[] NOT NULL");
  expect(sql).toContain("scores INTEGER[] NOT NULL");
});

test("DDL - Mixed schema with all new types", async () => {
  const adapter = new DummyAdapter();
  const db = createDB({
    events: {
      id: uuid,
      name: String,
      type: enumType('conference', 'meetup', 'workshop'),
      tags: arrayType(String),
      details: json<{ location: string }>(),
      createdAt: Date,
    }
  }, adapter);

  await db.createTables();

  const sql = adapter.logs[0].sql;
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS events");
  expect(sql).toContain("id UUID NOT NULL");
  expect(sql).toContain("name TEXT NOT NULL");
  expect(sql).toContain("type TEXT NOT NULL CHECK");
  expect(sql).toContain("tags TEXT[] NOT NULL");
  expect(sql).toContain("details JSONB NOT NULL");
  expect(sql).toContain("createdAt TIMESTAMP NOT NULL");
});
