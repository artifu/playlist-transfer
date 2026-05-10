import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = "data/playlist-transfer.sqlite";

let database = null;

function dbPath() {
  return resolve(process.env.TRANSFER_API_DB_PATH || DEFAULT_DB_PATH);
}

function getDatabase() {
  if (database) return database;

  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });

  database = new DatabaseSync(path);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      input TEXT NOT NULL,
      analysis_limit INTEGER NOT NULL,
      analysis_json TEXT NOT NULL,
      created_apple_playlist_id TEXT,
      created_from_confidence_threshold REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transfers_updated_at
      ON transfers(updated_at);
  `);

  return database;
}

function transferFromRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    input: row.input,
    analysisLimit: row.analysis_limit,
    analysis: JSON.parse(row.analysis_json),
    createdApplePlaylistId: row.created_apple_playlist_id,
    createdFromConfidenceThreshold: row.created_from_confidence_threshold,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function saveTransferRecord(transfer) {
  getDatabase()
    .prepare(`
      INSERT INTO transfers (
        id,
        status,
        input,
        analysis_limit,
        analysis_json,
        created_apple_playlist_id,
        created_from_confidence_threshold,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        input = excluded.input,
        analysis_limit = excluded.analysis_limit,
        analysis_json = excluded.analysis_json,
        created_apple_playlist_id = excluded.created_apple_playlist_id,
        created_from_confidence_threshold = excluded.created_from_confidence_threshold,
        updated_at = excluded.updated_at
    `)
    .run(
      transfer.id,
      transfer.status,
      transfer.input,
      transfer.analysisLimit,
      JSON.stringify(transfer.analysis),
      transfer.createdApplePlaylistId,
      transfer.createdFromConfidenceThreshold,
      transfer.createdAt,
      transfer.updatedAt
    );
}

export function findTransferRecord(transferId) {
  const row = getDatabase()
    .prepare(`
      SELECT
        id,
        status,
        input,
        analysis_limit,
        analysis_json,
        created_apple_playlist_id,
        created_from_confidence_threshold,
        created_at,
        updated_at
      FROM transfers
      WHERE id = ?
    `)
    .get(transferId);

  return transferFromRow(row);
}

export function storageInfo() {
  return {
    path: dbPath()
  };
}
