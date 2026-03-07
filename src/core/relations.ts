
/**
 * PawQL Relations System.
 *
 * Define relationships between tables in your schema for auto-joins.
 * Supports `hasMany`, `belongsTo`, and `hasOne`.
 *
 * @module relations
 */

/**
 * Types of relation supported by PawQL.
 */
export type RelationType = "hasMany" | "belongsTo" | "hasOne";

/**
 * A relation definition between two tables.
 */
export interface RelationDefinition {
  /** The type of relationship. */
  type: RelationType;

  /** The source table (the one that "owns" this relation). */
  from: string;

  /** The target table (the related table). */
  to: string;

  /**
   * The foreign key column.
   * For `hasMany` / `hasOne`: the column on the *target* table that references `from`.
   * For `belongsTo`: the column on the *source* table that references `to`.
   */
  foreignKey: string;

  /**
   * The local key on the referenced table.
   * @default 'id'
   */
  localKey?: string;
}

/**
 * Helper to define a "has many" relation.
 * The current table has many rows in the target table.
 *
 * @param to - The target table name
 * @param foreignKey - Column on the target table referencing this table
 * @param localKey - Column on this table being referenced (default: 'id')
 *
 * @example
 * ```typescript
 * const relations = defineRelations({
 *   users: {
 *     posts: hasMany('posts', 'userId'),
 *   },
 * });
 * ```
 */
export function hasMany(to: string, foreignKey: string, localKey: string = "id"): RelationDefinition {
  return { type: "hasMany", from: "", to, foreignKey, localKey };
}

/**
 * Helper to define a "belongs to" relation.
 * The current table has a foreign key pointing to the target table.
 *
 * @param to - The target table name
 * @param foreignKey - Column on this table referencing the target table
 * @param localKey - Column on the target table being referenced (default: 'id')
 *
 * @example
 * ```typescript
 * const relations = defineRelations({
 *   posts: {
 *     author: belongsTo('users', 'userId'),
 *   },
 * });
 * ```
 */
export function belongsTo(to: string, foreignKey: string, localKey: string = "id"): RelationDefinition {
  return { type: "belongsTo", from: "", to, foreignKey, localKey };
}

/**
 * Helper to define a "has one" relation.
 * The current table has exactly one related row in the target table.
 *
 * @param to - The target table name
 * @param foreignKey - Column on the target table referencing this table
 * @param localKey - Column on this table being referenced (default: 'id')
 *
 * @example
 * ```typescript
 * const relations = defineRelations({
 *   users: {
 *     profile: hasOne('profiles', 'userId'),
 *   },
 * });
 * ```
 */
export function hasOne(to: string, foreignKey: string, localKey: string = "id"): RelationDefinition {
  return { type: "hasOne", from: "", to, foreignKey, localKey };
}

/**
 * Schema for defining relations per table.
 * Each table maps relation names to their definitions.
 */
export type RelationsSchema = Record<string, Record<string, RelationDefinition>>;

/**
 * Define relations for your database schema.
 *
 * Resolves the `from` field of each relation to match its parent table key,
 * and returns a frozen relation map ready for use with `createDB()`.
 *
 * @param schema - A map of table names to their named relations
 * @returns A resolved `RelationsSchema` object
 *
 * @example
 * ```typescript
 * import { defineRelations, hasMany, belongsTo, hasOne } from 'pawql';
 *
 * const relations = defineRelations({
 *   users: {
 *     posts: hasMany('posts', 'userId'),
 *     profile: hasOne('profiles', 'userId'),
 *   },
 *   posts: {
 *     author: belongsTo('users', 'userId'),
 *   },
 * });
 * ```
 */
export function defineRelations(schema: RelationsSchema): RelationsSchema {
  const resolved: RelationsSchema = {};

  for (const [tableName, relations] of Object.entries(schema)) {
    resolved[tableName] = {};
    for (const [relName, relDef] of Object.entries(relations)) {
      resolved[tableName]![relName] = {
        ...relDef,
        from: tableName,
      };
    }
  }

  return resolved;
}

/**
 * RelationManager provides runtime access to relation definitions
 * and generates the correct JOIN parameters.
 * @internal
 */
export class RelationManager {
  private _relations: RelationsSchema;

  constructor(relations: RelationsSchema) {
    this._relations = relations;
  }

  /**
   * Get a specific relation definition.
   *
   * @param table - The source table name
   * @param name - The relation name (e.g., 'posts', 'author')
   * @returns The relation definition, or undefined if not found
   */
  get(table: string, name: string): RelationDefinition | undefined {
    return this._relations[table]?.[name];
  }

  /**
   * Get all relations for a table.
   */
  getAll(table: string): Record<string, RelationDefinition> | undefined {
    return this._relations[table];
  }

  /**
   * Resolve a relation into JOIN parameters (table, col1, op, col2) and JOIN type.
   *
   * @param table - The source table
   * @param name - The relation name
   * @returns An object with joinTable, col1, op, col2, and joinType
   */
  resolveJoin(
    table: string,
    name: string
  ): { joinTable: string; col1: string; op: string; col2: string; joinType: "INNER" | "LEFT" } | null {
    const rel = this.get(table, name);
    if (!rel) return null;

    const localKey = rel.localKey || "id";

    switch (rel.type) {
      case "hasMany":
      case "hasOne":
        // users.id = posts.userId
        return {
          joinTable: rel.to,
          col1: `${table}.${localKey}`,
          op: "=",
          col2: `${rel.to}.${rel.foreignKey}`,
          joinType: rel.type === "hasOne" ? "LEFT" : "LEFT",
        };

      case "belongsTo":
        // posts.userId = users.id
        return {
          joinTable: rel.to,
          col1: `${table}.${rel.foreignKey}`,
          op: "=",
          col2: `${rel.to}.${localKey}`,
          joinType: "LEFT",
        };

      default:
        return null;
    }
  }

  /**
   * Get the raw relations schema.
   */
  get schema(): RelationsSchema {
    return this._relations;
  }
}
