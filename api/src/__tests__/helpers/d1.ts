import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

/** Execute actual D1 SQL against SQLite, including atomic batches and parameter limits. */
export function createTestD1() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../../drizzle/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  class Statement {
    constructor(readonly query: string, readonly params: unknown[] = []) {}
    bind(...params: unknown[]) {
      if (params.length > 100) throw new Error("D1 bound parameter limit exceeded");
      if (params.some(value => typeof value === "string" && new TextEncoder().encode(value).length > 1_000_000)) throw new Error("D1 value size exceeded");
      return new Statement(this.query, params);
    }
    execute() { return sqlite.prepare(this.query).all(...this.params); }
    async all() { return { success: true, results: this.execute(), meta: {} }; }
    async raw() { const statement = sqlite.prepare(this.query); statement.setReturnArrays(true); return statement.all(...this.params); }
    async run() { const result = sqlite.prepare(this.query).run(...this.params); return { success: true, results: [], meta: { changes: Number(result.changes) } }; }
    async first() { return sqlite.prepare(this.query).get(...this.params) ?? null; }
  }
  const binding = {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => ({ success: true, results: statement.execute(), meta: {} }));
        sqlite.exec("COMMIT"); return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { binding, sqlite, close: () => sqlite.close() };
}
