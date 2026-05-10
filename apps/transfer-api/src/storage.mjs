let adapterPromise = null;

function storageDriverName() {
  return (process.env.TRANSFER_API_STORAGE_DRIVER || "sqlite").trim().toLowerCase();
}

async function createStorageAdapter() {
  const driver = storageDriverName();

  if (driver === "sqlite") {
    const { createSqliteStorageAdapter } = await import("./storage-drivers/sqlite.mjs");
    return createSqliteStorageAdapter();
  }

  if (driver === "supabase-rest") {
    const { createSupabaseRestStorageAdapter } = await import("./storage-drivers/supabase-rest.mjs");
    return createSupabaseRestStorageAdapter();
  }

  throw new Error(`Unsupported TRANSFER_API_STORAGE_DRIVER "${driver}". Supported drivers: sqlite, supabase-rest.`);
}

export async function storageAdapter() {
  if (!adapterPromise) adapterPromise = createStorageAdapter();
  return await adapterPromise;
}

export async function saveTransferRecord(transfer) {
  const adapter = await storageAdapter();
  await adapter.saveTransferRecord(transfer);
}

export async function findTransferRecord(transferId, sessionId) {
  const adapter = await storageAdapter();
  return await adapter.findTransferRecord(transferId, sessionId);
}

export async function deleteExpiredTransferRecords(cutoffIso) {
  const adapter = await storageAdapter();
  return await adapter.deleteExpiredTransferRecords(cutoffIso);
}

export async function storageInfo() {
  const adapter = await storageAdapter();
  return adapter.storageInfo();
}
