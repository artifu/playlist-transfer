import { createSqliteStorageAdapter } from "./storage-drivers/sqlite.mjs";

let adapter = null;

function storageDriverName() {
  return (process.env.TRANSFER_API_STORAGE_DRIVER || "sqlite").trim().toLowerCase();
}

function createStorageAdapter() {
  const driver = storageDriverName();

  if (driver === "sqlite") {
    return createSqliteStorageAdapter();
  }

  throw new Error(`Unsupported TRANSFER_API_STORAGE_DRIVER "${driver}". Supported drivers: sqlite.`);
}

export function storageAdapter() {
  if (!adapter) adapter = createStorageAdapter();
  return adapter;
}

export function saveTransferRecord(transfer) {
  storageAdapter().saveTransferRecord(transfer);
}

export function findTransferRecord(transferId, sessionId) {
  return storageAdapter().findTransferRecord(transferId, sessionId);
}

export function deleteExpiredTransferRecords(cutoffIso) {
  return storageAdapter().deleteExpiredTransferRecords(cutoffIso);
}

export function storageInfo() {
  return storageAdapter().storageInfo();
}
