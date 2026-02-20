
import { test, expect } from "bun:test";
import { createDB } from "../src/core/database";
import { DummyAdapter } from "../src/adapters/dummy";

const db = createDB({
  users: {
    id: Number,
    name: String,
    age: Number,
    status: String,
  }
}, new DummyAdapter());

test("Advanced Filtering - OR", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { id: Number, name: String } }, adapter);
    
    await db.query('users')
        .where({ name: 'John' })
        .orWhere({ name: 'Doe' })
        .execute();
    
    const sql = adapter.logs[0].sql;
    expect(sql).toContain("name = $1");
    expect(sql).toContain("OR name = $2");
});

test("Advanced Filtering - IN", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { id: Number, status: String } }, adapter);
    
    await db.query('users')
        .where({ status: { in: ['active', 'pending'] } })
        .execute();
    
    const sql = adapter.logs[0].sql;
    expect(sql).toContain("status IN ($1, $2)");
    expect(adapter.logs[0].params).toEqual(['active', 'pending']);
});

test("Advanced Filtering - LIKE", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { name: String } }, adapter);
    
    await db.query('users')
        .where({ name: { like: '%John%' } })
        .execute();
    
    expect(adapter.logs[0].sql).toContain("name LIKE $1");
    expect(adapter.logs[0].params).toEqual(['%John%']);
});

test("Advanced Filtering - Comparison", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { age: Number } }, adapter);
    
    await db.query('users')
        .where({ age: { gt: 18, lte: 60 } })
        .execute();
    
    // Should produce: age > $1 AND age <= $2
    // Note: The order depends on object iteration order, which is generally insertion order for simple keys
    const sql = adapter.logs[0].sql;
    expect(sql).toContain("age > $1");
    expect(sql).toContain("age <= $2"); 
    // AND is implicit between multiple keys/conditions in one object? 
    // Wait, multiple keys in one object = AND. Multiple conditions on one key = AND too usually?
    // My implementation: 
    /*
      for (const [key, val] of Object.entries(conditions)) {
          // ... 
          if ("gt" in ops) this._where.push(...)
          if ("lt" in ops) this._where.push(...)
      }
    */
    // They are pushed as separate WHERE clauses.
    // _toSQL joins them with " AND " (or " OR " based on type).
    // But wait, the _addWhere adds them all with type "AND" (if called via .where).
    // Yes.
    
    // Let's verify structure
    expect(sql).toMatch(/age > \$1 AND (AND )?age <= \$2/);
});

test("Advanced Filtering - IS NULL", async () => {
    const adapter = new DummyAdapter();
    const db = createDB({ users: { deletedAt: Date } }, adapter);
    
    await db.query('users')
        .where({ deletedAt: null })
        .execute();
        
    expect(adapter.logs[0].sql).toContain("deletedAt IS NULL");
});
