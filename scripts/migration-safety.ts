import { readMigrationFiles } from "drizzle-orm/migrator";

// Historical data-cleanup migrations must not run unnoticed on a populated DB.
// Keep applied migrations immutable; require an operator-reviewed migration plan.
export function assertSafeMigrations(lastApplied: number, hasUsers: boolean) {
  if (!hasUsers) return;
  const destructive = readMigrationFiles({ migrationsFolder: "./drizzle" })
    .filter((migration) => migration.folderMillis > lastApplied)
    .some((migration) =>
      migration.sql.some((statement) =>
        /\bDELETE\s+FROM\b|\bTRUNCATE\b/i.test(statement),
      ),
    );
  if (destructive) {
    throw new Error(
      "Pending data-deletion migration detected on a populated database. Review historical cleanup migration 0007 before proceeding; no migrations were applied.",
    );
  }
}
