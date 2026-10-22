import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getMigrationsDir(customMigrationsDir?: string): string | null {
  if (customMigrationsDir && fs.existsSync(customMigrationsDir)) {
    return customMigrationsDir;
  }

  // Candidate 1: relative to current file (works in tsx / src)
  const cand1 = path.resolve(__dirname, 'migrations');
  if (fs.existsSync(cand1)) {
    return cand1;
  }

  // Candidate 2: from dist/db to src/db/migrations (works in compiled dist)
  const cand2 = path.resolve(__dirname, '..', '..', 'src', 'db', 'migrations');
  if (fs.existsSync(cand2)) {
    return cand2;
  }

  return null;
}

export function runMigrations(db: Database.Database, customMigrationsDir?: string): string[] {
  // 1. Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = getMigrationsDir(customMigrationsDir);

  if (!migrationsDir) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const getApplied = db.prepare('SELECT id FROM _migrations WHERE id = ?');
  const insertApplied = db.prepare('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)');

  const newlyApplied: string[] = [];

  for (const file of files) {
    const existing = getApplied.get(file);
    if (!existing) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

      const applyMigration = db.transaction(() => {
        db.exec(sql);
        insertApplied.run(file, new Date().toISOString());
      });

      applyMigration();
      newlyApplied.push(file);
    }
  }

  return newlyApplied;
}
