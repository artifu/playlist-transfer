const SCHEMA_STATEMENTS = [
  `create table if not exists transfers (
    id text primary key,
    session_id text not null,
    status text not null,
    input text not null,
    analysis_limit integer not null,
    analysis_json text not null,
    created_apple_playlist_id text,
    created_from_confidence_threshold real,
    created_at text not null,
    updated_at text not null
  )`,
  `create index if not exists idx_transfers_updated_at on transfers (updated_at)`,
  `create index if not exists idx_transfers_session_updated_at on transfers (session_id, updated_at)`,
  `create table if not exists jobs (
    id text primary key,
    session_id text not null,
    kind text not null,
    status text not null,
    phase text not null,
    progress integer not null,
    completed integer not null,
    total integer not null,
    result_json text,
    error text,
    playlist_name text,
    original_total_items integer,
    created_at text not null,
    updated_at text not null,
    expires_at text not null
  )`,
  `create index if not exists idx_jobs_session_updated_at on jobs (session_id, updated_at)`,
  `create index if not exists idx_jobs_expires_at on jobs (expires_at)`,
  `create table if not exists apple_isrc_cache (
    cache_key text primary key,
    storefront text not null,
    isrc text not null,
    candidates_json text not null,
    created_at text not null,
    expires_at text not null
  )`,
  `create index if not exists idx_apple_isrc_cache_expires_at on apple_isrc_cache (expires_at)`,
  `create table if not exists analytics_events (
    id text primary key,
    event text not null,
    anonymous_session text,
    properties_json text not null,
    observed_at text not null
  )`,
  `create index if not exists idx_analytics_events_observed_at on analytics_events (observed_at)`,
  `create index if not exists idx_analytics_events_event_observed_at on analytics_events (event, observed_at)`
];

let schemaReady = false;
let lastCleanupAt = 0;

const DEFAULT_TRANSFER_RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const ANALYTICS_RETENTION_DAYS = 90;

export function requireD1(env) {
  if (!env.PLAYLIST_TRANSFER_DB) {
    throw new Error("Cloudflare D1 binding PLAYLIST_TRANSFER_DB is not configured.");
  }
  return env.PLAYLIST_TRANSFER_DB;
}

export async function ensureSchema(env) {
  if (schemaReady) return;
  const db = requireD1(env);
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
  schemaReady = true;
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutesIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function transferRetentionDays(env) {
  const configured = Number(env.TRANSFER_API_TRANSFER_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return DEFAULT_TRANSFER_RETENTION_DAYS;
  return Math.min(90, Math.max(1, Math.floor(configured)));
}

function transferRetentionCutoff(env) {
  const retentionMs = transferRetentionDays(env) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - retentionMs).toISOString();
}

async function cleanupExpiredRecords(env) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;

  await ensureSchema(env);
  const db = requireD1(env);
  await db.batch([
    db.prepare("delete from transfers where updated_at < ?").bind(transferRetentionCutoff(env)),
    db.prepare("delete from jobs where expires_at < ?").bind(new Date(now).toISOString()),
    db.prepare("delete from apple_isrc_cache where expires_at < ?").bind(new Date(now).toISOString()),
    db.prepare("delete from analytics_events where observed_at < ?").bind(
      new Date(now - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    )
  ]);
  lastCleanupAt = now;
}

export async function saveAnalyticsEvent(env, payload) {
  await ensureSchema(env);
  await requireD1(env)
    .prepare(
      `insert into analytics_events (
        id,
        event,
        anonymous_session,
        properties_json,
        observed_at
      ) values (?, ?, ?, ?, ?)`
    )
    .bind(
      randomId(),
      payload.event,
      payload.anonymousSession,
      JSON.stringify(payload.properties || {}),
      payload.observedAt
    )
    .run();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomId() {
  return crypto.randomUUID();
}

function transferToPayload(transfer) {
  return {
    ...clone(transfer.analysis),
    transferId: transfer.id,
    transfer: {
      id: transfer.id,
      status: transfer.status,
      input: transfer.input,
      analysisLimit: transfer.analysisLimit,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      createdApplePlaylistId: transfer.createdApplePlaylistId,
      createdFromConfidenceThreshold: transfer.createdFromConfidenceThreshold
    },
    createdApplePlaylistId: transfer.createdApplePlaylistId,
    createdFromConfidenceThreshold: transfer.createdFromConfidenceThreshold
  };
}

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

export async function saveTransfer(env, transfer) {
  await ensureSchema(env);
  const db = requireD1(env);
  await db
    .prepare(
      `insert into transfers (
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
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        session_id = excluded.session_id,
        status = excluded.status,
        input = excluded.input,
        analysis_limit = excluded.analysis_limit,
        analysis_json = excluded.analysis_json,
        created_apple_playlist_id = excluded.created_apple_playlist_id,
        created_from_confidence_threshold = excluded.created_from_confidence_threshold,
        updated_at = excluded.updated_at`
    )
    .bind(
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
    )
    .run();
}

export async function createTransfer(env, { sessionId, input, analysisLimit, analysis }) {
  await cleanupExpiredRecords(env);
  const transfer = {
    id: randomId(),
    sessionId,
    status: "analyzed",
    input,
    analysisLimit,
    analysis: clone(analysis),
    createdApplePlaylistId: null,
    createdFromConfidenceThreshold: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await saveTransfer(env, transfer);
  return transferToPayload(transfer);
}

export async function findTransfer(env, transferId, sessionId) {
  await ensureSchema(env);
  const row = await requireD1(env)
    .prepare(`select * from transfers where id = ? and session_id = ? and updated_at >= ? limit 1`)
    .bind(transferId, sessionId, transferRetentionCutoff(env))
    .first();

  const transfer = transferFromRow(row);
  return transfer ? transferToPayload(transfer) : null;
}

async function requireTransfer(env, transferId, sessionId) {
  await ensureSchema(env);
  const row = await requireD1(env)
    .prepare(`select * from transfers where id = ? and session_id = ? and updated_at >= ? limit 1`)
    .bind(transferId, sessionId, transferRetentionCutoff(env))
    .first();
  const transfer = transferFromRow(row);

  if (!transfer) {
    throw new Error("Transfer not found for this session. It may have expired or was created in another browser session.");
  }

  return transfer;
}

function refreshAnalysisSummary(analysis) {
  const total = analysis.items.length;
  const needsReviewCount = analysis.items.filter((item) => item.status === "needs_review").length;
  const confidentMatchCount = analysis.items.filter((item) => item.status === "matched").length;
  const unmatchedCount = analysis.items.filter((item) => item.status === "unmatched").length;
  const matchedCount = total - unmatchedCount;

  analysis.summary = {
    ...analysis.summary,
    matchedCount,
    unmatchedCount,
    needsReviewCount,
    confidentMatchCount,
    matchRate: total === 0 ? 0 : matchedCount / total
  };
}

export async function applyTransferItemDecision(env, transferId, sessionId, index, decision) {
  const transfer = await requireTransfer(env, transferId, sessionId);
  const item = transfer.analysis.items.find((candidate) => candidate.index === index);
  if (!item) throw new Error("Transfer item not found.");

  const action = String(decision.action ?? "").trim();

  if (action === "approve") {
    if (!item.appleCandidate) {
      throw new Error("This track does not have an Apple Music candidate to approve.");
    }
    item.status = "matched";
    item.confidence = Math.max(item.confidence ?? 0, 0.82);
    item.reason = "approved-by-user";
  } else if (action === "skip") {
    item.status = "unmatched";
    item.confidence = 0;
    item.reason = "skipped-by-user";
    item.appleCandidate = null;
  } else if (action === "use-candidate") {
    const candidateIndex = Number(decision.candidateIndex);
    const candidate = item.candidates?.[candidateIndex];
    if (!Number.isInteger(candidateIndex) || !candidate) {
      throw new Error("Candidate not found for this transfer item.");
    }
    item.appleCandidate = candidate;
    item.status = "matched";
    item.confidence = Math.max(item.confidence ?? 0, 0.82);
    item.reason = "selected-by-user";
  } else {
    throw new Error("Unsupported transfer item action.");
  }

  transfer.status = transfer.createdApplePlaylistId ? "created" : "reviewed";
  transfer.updatedAt = nowIso();
  refreshAnalysisSummary(transfer.analysis);
  await saveTransfer(env, transfer);
  return transferToPayload(transfer);
}

export async function markTransferCreated(env, transferId, sessionId, createdApplePlaylistId, threshold) {
  const transfer = await requireTransfer(env, transferId, sessionId);
  transfer.status = "created";
  transfer.createdApplePlaylistId = createdApplePlaylistId;
  transfer.createdFromConfidenceThreshold = threshold;
  transfer.updatedAt = nowIso();
  await saveTransfer(env, transfer);
  return transferToPayload(transfer);
}

export async function createJob(env, kind, sessionId = "") {
  await cleanupExpiredRecords(env);
  const job = {
    id: randomId(),
    sessionId,
    kind,
    status: "queued",
    phase: "Queued",
    progress: 0,
    completed: 0,
    total: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expiresAt: addMinutesIso(30),
    result: null,
    error: null,
    playlistName: null,
    originalTotalItems: null
  };

  await saveJob(env, job);
  return job;
}

function jobFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    completed: row.completed,
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error,
    playlistName: row.playlist_name,
    originalTotalItems: row.original_total_items
  };
}

export function serializeJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    completed: job.completed,
    total: job.total,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.status === "complete" ? job.result : null,
    error: job.error
  };
}

export async function saveJob(env, job) {
  await ensureSchema(env);
  await requireD1(env)
    .prepare(
      `insert into jobs (
        id,
        session_id,
        kind,
        status,
        phase,
        progress,
        completed,
        total,
        result_json,
        error,
        playlist_name,
        original_total_items,
        created_at,
        updated_at,
        expires_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        status = excluded.status,
        phase = excluded.phase,
        progress = excluded.progress,
        completed = excluded.completed,
        total = excluded.total,
        result_json = excluded.result_json,
        error = excluded.error,
        playlist_name = excluded.playlist_name,
        original_total_items = excluded.original_total_items,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at`
    )
    .bind(
      job.id,
      job.sessionId,
      job.kind,
      job.status,
      job.phase,
      job.progress,
      job.completed,
      job.total,
      job.result ? JSON.stringify(job.result) : null,
      job.error,
      job.playlistName,
      job.originalTotalItems,
      job.createdAt,
      job.updatedAt,
      job.expiresAt
    )
    .run();
}

export async function updateJob(env, job, patch) {
  Object.assign(job, patch, {
    updatedAt: nowIso()
  });
  await saveJob(env, job);
}

export async function findJob(env, jobId, sessionId) {
  await ensureSchema(env);
  const row = await requireD1(env)
    .prepare(`select * from jobs where id = ? and session_id = ? limit 1`)
    .bind(jobId, sessionId)
    .first();

  return jobFromRow(row);
}

export async function loadTransferReport(env, transferId, sessionId) {
  const transfer = await requireTransfer(env, transferId, sessionId);
  return transferToPayload(transfer);
}
