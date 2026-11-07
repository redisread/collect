import { describe, expect, it } from "vitest";
import { getAuthTables } from "better-auth/db";
import { getTableColumns, type Column } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { createAuth } from "../lib/auth";
import { account, session, user, verification } from "../db/schema";

describe("Better Auth schema compatibility", () => {
  const auth = createAuth({} as D1Database, "schema-test-secret-at-least-32-characters", "https://collect.jiahongw.com");
  const authTables = getAuthTables(auth.options);
  const drizzleTables = { account, session, user, verification };

  it.each(Object.entries(drizzleTables))("maps every Better Auth %s field to a Drizzle column", (name, table) => {
    const columns: Record<string, Column> = getTableColumns(table);
    const expectedTable = authTables[name];
    expect(expectedTable).toBeDefined();

    for (const [field, definition] of Object.entries(expectedTable.fields)) {
      const column = columns[definition.fieldName ?? field];
      expect(column, `${name}.${field} is missing from the Drizzle schema`).toBeDefined();
      expect(column.dataType, `${name}.${field} has an incompatible type`).toBe(definition.type);
    }
  });

  it("enforces the issuer/account identity required by Better Auth", () => {
    expect(authTables.account.indexes).toContainEqual({ fields: ["issuer", "accountId"], unique: true });
    const indexes = getTableConfig(account).indexes;
    expect(indexes.some(({ config }) => config.unique &&
      config.columns.length === 2 &&
      config.columns[0] === account.issuer &&
      config.columns[1] === account.accountId)).toBe(true);
    expect(account.issuer.default).toBe("local:credential");
    expect(account.issuer.notNull).toBe(true);
  });
});
