import { deleteExpiredTransferRecords } from "./storage.mjs";

const DEFAULT_TRANSFER_RETENTION_DAYS = 7;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function transferRetentionDays() {
  return numberFromEnv("TRANSFER_API_TRANSFER_RETENTION_DAYS", DEFAULT_TRANSFER_RETENTION_DAYS);
}

export function cleanupIntervalMs() {
  return numberFromEnv("TRANSFER_API_CLEANUP_INTERVAL_MS", DEFAULT_CLEANUP_INTERVAL_MS);
}

export function cleanupExpiredTransfers(now = new Date()) {
  const retentionDays = transferRetentionDays();

  if (retentionDays <= 0) {
    return {
      enabled: false,
      deletedCount: 0,
      retentionDays
    };
  }

  const cutoffIso = new Date(now.getTime() - retentionDays * MS_PER_DAY).toISOString();

  return {
    enabled: true,
    deletedCount: deleteExpiredTransferRecords(cutoffIso),
    cutoffIso,
    retentionDays
  };
}

export function startTransferCleanupLoop(logger = console) {
  const runCleanup = () => {
    try {
      const result = cleanupExpiredTransfers();
      if (result.enabled && result.deletedCount > 0) {
        logger.log(`Deleted ${result.deletedCount} expired transfer records older than ${result.cutoffIso}`);
      }
    } catch (error) {
      logger.warn(`Transfer cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  runCleanup();

  const intervalMs = cleanupIntervalMs();
  if (intervalMs <= 0) return { stop() {} };

  const timer = setInterval(runCleanup, intervalMs);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
    }
  };
}
