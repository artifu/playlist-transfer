import { randomUUID } from "node:crypto";
import {
  findTransferRecord,
  saveTransferRecord
} from "./storage.mjs";

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

export function createTransfer({ sessionId, input, analysisLimit, analysis }) {
  const transfer = {
    id: randomUUID(),
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

  saveTransferRecord(transfer);

  return serializeTransfer(transfer);
}

export function getTransfer(transferId, sessionId) {
  const transfer = findTransferRecord(transferId, sessionId);
  return transfer ? serializeTransfer(transfer) : null;
}

export function requireTransfer(transferId, sessionId) {
  const transfer = findTransferRecord(transferId, sessionId);
  if (!transfer) {
    throw new Error("Transfer not found for this session. It may have been deleted, created in another browser session, or the local database path may have changed.");
  }

  return transfer;
}

export function serializeTransfer(transfer) {
  return analysisWithTransfer(transfer);
}

export function applyTransferItemDecision(transferId, sessionId, index, decision) {
  const transfer = requireTransfer(transferId, sessionId);
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
  saveTransferRecord(transfer);

  return serializeTransfer(transfer);
}

export function markTransferCreated(transferId, sessionId, createdApplePlaylistId, threshold) {
  const transfer = requireTransfer(transferId, sessionId);
  transfer.status = "created";
  transfer.createdApplePlaylistId = createdApplePlaylistId;
  transfer.createdFromConfidenceThreshold = threshold;
  transfer.updatedAt = nowIso();
  saveTransferRecord(transfer);
  return serializeTransfer(transfer);
}
