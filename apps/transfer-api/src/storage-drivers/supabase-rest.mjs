function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} for Supabase REST storage.`);
  return value;
}

function tableName() {
  return process.env.SUPABASE_TRANSFERS_TABLE?.trim() || "transfers";
}

function supabaseConfig() {
  const url = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return {
    url,
    key,
    table: tableName()
  };
}

function transferToRow(transfer) {
  return {
    id: transfer.id,
    session_id: transfer.sessionId,
    status: transfer.status,
    input: transfer.input,
    analysis_limit: transfer.analysisLimit,
    analysis_json: transfer.analysis,
    created_apple_playlist_id: transfer.createdApplePlaylistId,
    created_from_confidence_threshold: transfer.createdFromConfidenceThreshold,
    created_at: transfer.createdAt,
    updated_at: transfer.updatedAt
  };
}

function transferFromRow(row) {
  if (!row) return null;

  const analysis = typeof row.analysis_json === "string"
    ? JSON.parse(row.analysis_json)
    : row.analysis_json;

  return {
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    input: row.input,
    analysisLimit: row.analysis_limit,
    analysis,
    createdApplePlaylistId: row.created_apple_playlist_id,
    createdFromConfidenceThreshold: row.created_from_confidence_threshold,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function selectColumns() {
  return [
    "id",
    "session_id",
    "status",
    "input",
    "analysis_limit",
    "analysis_json",
    "created_apple_playlist_id",
    "created_from_confidence_threshold",
    "created_at",
    "updated_at"
  ].join(",");
}

async function requestJson(path, options = {}) {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...options.headers
    }
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.hint || text || "Supabase REST request failed.";
    throw new Error(`Supabase REST ${response.status}: ${message}`);
  }

  return payload;
}

export function createSupabaseRestStorageAdapter() {
  return {
    driver: "supabase-rest",

    async saveTransferRecord(transfer) {
      const config = supabaseConfig();
      const query = new URLSearchParams({ on_conflict: "id" });

      await requestJson(`${config.table}?${query.toString()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(transferToRow(transfer))
      });
    },

    async findTransferRecord(transferId, sessionId) {
      const config = supabaseConfig();
      const query = new URLSearchParams({
        id: `eq.${transferId}`,
        session_id: `eq.${sessionId}`,
        select: selectColumns(),
        limit: "1"
      });
      const rows = await requestJson(`${config.table}?${query.toString()}`);
      return transferFromRow(rows?.[0]);
    },

    async deleteExpiredTransferRecords(cutoffIso) {
      const config = supabaseConfig();
      const query = new URLSearchParams({
        updated_at: `lt.${cutoffIso}`,
        select: "id"
      });
      const rows = await requestJson(`${config.table}?${query.toString()}`, {
        method: "DELETE",
        headers: {
          Prefer: "return=representation"
        }
      });

      return Array.isArray(rows) ? rows.length : 0;
    },

    storageInfo() {
      const config = supabaseConfig();
      return {
        driver: "supabase-rest",
        url: config.url,
        table: config.table
      };
    }
  };
}
