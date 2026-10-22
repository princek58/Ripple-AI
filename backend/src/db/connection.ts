import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import config from '../config.js';
import { runMigrations } from './migrate.js';

let dbInstance: Database.Database | null = null;

export function createDatabase(dbPath?: string): Database.Database {
  const targetPath = dbPath || config.dbPath;

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for persistent files
  if (targetPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Automatically apply migrations
  runMigrations(db);

  return db;
}

export function getDatabase(dbPath?: string): Database.Database {
  if (!dbInstance) {
    dbInstance = createDatabase(dbPath);
  }
  return dbInstance;
}

export function setDatabase(db: Database.Database): void {
  if (dbInstance && dbInstance.open && dbInstance !== db) {
    dbInstance.close();
  }
  dbInstance = db;
}

export function closeDatabase(): void {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    dbInstance = null;
  }
}
