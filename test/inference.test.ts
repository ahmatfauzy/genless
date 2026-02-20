
import { test, expect, describe } from "bun:test";
import { createDB, string, number, boolean, date } from "../src/index";
import { DummyAdapter } from "../src/adapters/dummy";

// Define schema
const schema = {
  users: {
    id: number,
    name: string,
    email: string,
    isActive: boolean
  },
  posts: {
    id: number,
    userId: number,
    title: string,
    content: string,
    created_at: date
  }
};

describe("Query Builder Tests", () => {
    test("createDB initializes correctly", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);
        expect(db).toBeDefined();
    });

    test("query builder generates correct SQL for select + where", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);

        const query = db.query("users")
            .select("id", "name")
            .where({ isActive: true })
            .limit(10)
            .offset(0);
        
        const { sql, values } = query.toSQL();

        expect(sql).toBe("SELECT id, name FROM users WHERE isActive = $1 LIMIT 10 OFFSET 0");
        expect(values).toEqual([true]);
    });

    test("query builder generates correct SQL for insert", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);

        const query = db.query("users")
            .insert({ name: "Fauzi", email: "test@example.com", isActive: true });
        
        const { sql, values } = query.toSQL();
        
        // Order of keys depends on JS engine but usually insertion order
        expect(sql).toContain("INSERT INTO users");
        expect(sql).toContain("name, email, isActive");
        expect(sql).toContain("RETURNING *");
        expect(values).toHaveLength(3);
    });

    test("query builder generates correct SQL for update", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);

        const query = db.query("users")
            .update({ isActive: false })
            .where({ id: 123 });
        
        const { sql, values } = query.toSQL();
        
        expect(sql).toBe("UPDATE users SET isActive = $1 WHERE id = $2 RETURNING *");
        expect(values).toEqual([false, 123]);
    });

    test("query builder generates correct SQL for delete", () => {
        const adapter = new DummyAdapter() as any;
        const db = createDB(schema, adapter);

        const query = db.query("posts")
            .delete()
            .where({ id: 999 });
        
        const { sql, values } = query.toSQL();
        
        expect(sql).toBe("DELETE FROM posts WHERE id = $1 RETURNING *");
        expect(values).toEqual([999]);
    });
});
