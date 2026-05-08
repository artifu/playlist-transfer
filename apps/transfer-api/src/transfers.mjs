import { randomUUID } from "node:crypto";

const TRANSFER_RETENTION_MS = 24 * 60 * 60 * 1000;
const transfers = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
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

function analysisWithTransfer(transfer) {
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

export function createTransfer({ input, analysisLimit, analysis }) {
  const transfer = {
    id: randomUUID(),
    status: "analyzed",
    input,
    analysisLimit,
    analysis: clone(analysis),
    createdApplePlaylistId: null,
    createdFromConfidenceThreshold: null,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  transfers.set(transfer.id, transfer);
  setTimeout(() => {
    transfers.delete(transfer.id);
  }, TRANSFER_RETENTION_MS).unref();

  return serializeTransfer(transfer);
}

export function getTransfer(transferId) {
  const transfer = transfers.get(transferId);
  return transfer ? serializeTransfer(transfer) : null;
}

export function requireTransfer(transferId) {
  const transfer = transfers.get(transferId);
  if (!transfer) {
    throw new Error("Transfer not found. It may have expired or the API server may have restarted.");
  }

  return transfer;
}

export function serializeTransfer(transfer) {
  return analysisWithTransfer(transfer);
}

export function applyTransferItemDecision(transferId, index, decision) {
  const transfer = requireTransfer(transferId);
  const item = transfer.analysis.items.find((candidate) => candidate.index === index);

  if (!item) {
    throw new Error("Transfer item not found.");
  }

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

  return serializeTransfer(transfer);
}

export function markTransferCreated(transferId, createdApplePlaylistId, threshold) {
  const transfer = requireTransfer(transferId);
  transfer.status = "created";
  transfer.createdApplePlaylistId = createdApplePlaylistId;
  transfer.createdFromConfidenceThreshold = threshold;
  transfer.updatedAt = nowIso();
  return serializeTransfer(transfer);
}
