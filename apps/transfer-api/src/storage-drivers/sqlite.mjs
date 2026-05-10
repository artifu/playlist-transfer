import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DB_PATH = "data/playlist-transfer.sqlite";

function transferFromRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.session_id,
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

export function createSqliteStorageAdapter() {
  let database = null;

  function dbPath() {
    return resolve(process.env.TRANSFER_API_DB_PATH || DEFAULT_DB_PATH);
  }

  function ensureTransferSessionColumn(db) {
    const columns = db.prepare("PRAGMA table_info(transfers)").all();
    const hasSessionId = columns.some((column) => column.name === "session_id");

    if (!hasSessionId) {
      db.exec("ALTER TABLE transfers ADD COLUMN session_id TEXT NOT NULL DEFAULT 'legacy-local-session'");
    }

    db.exec("CREATE INDEX IF NOT EXISTS idx_transfers_session_updated_at ON transfers(session_id, updated_at)");
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
        session_id TEXT NOT NULL DEFAULT 'legacy-local-session',
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

    ensureTransferSessionColumn(database);

    return database;
  }

  return {
    driver: "sqlite",

    saveTransferRecord(transfer) {
      getDatabase()
        .prepare(`
          INSERT INTO transfers (
            id,
            session_id,
            status,
            input,
            analysis_limit,
            analysis_json,
            created_apple_playlist_id,
            created_from_confidence_threshold,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
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
          transfer.sessionId,
          transfer.status,
          transfer.input,
          transfer.analysisLimit,
          JSON.stringify(transfer.analysis),
          transfer.createdApplePlaylistId,
          transfer.createdFromConfidenceThreshold,
          transfer.createdAt,
          transfer.updatedAt
        );
    },

    findTransferRecord(transferId, sessionId) {
      const row = getDatabase()
        .prepare(`
          SELECT
            id,
            session_id,
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
            AND session_id = ?
        `)
        .get(transferId, sessionId);

      return transferFromRow(row);
    },

    deleteExpiredTransferRecords(cutoffIso) {
      return getDatabase()
        .prepare("DELETE FROM transfers WHERE updated_at < ?")
        .run(cutoffIso).changes;
    },

    storageInfo() {
      return {
        driver: "sqlite",
        path: dbPath()
      };
    }
  };
}
