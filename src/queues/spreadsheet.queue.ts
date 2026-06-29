import { Queue, Worker } from 'bullmq';
import prisma from '../config/db';
import { runBypassingTenant } from '../utils/tenant-context';
import { syncSpreadsheetLeads } from '../modules/google-sheets/spreadsheetSync.service';
import { logger } from '../utils/logger';
import { redisConnection } from '../utils/redis';

const connection = redisConnection;

// --- Queue Setup ---
export const spreadsheetQueue = new Queue('spreadsheet-sync', {
  connection: connection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

// --- Worker Setup ---
export let spreadsheetWorker: Worker | undefined = undefined;

if (process.env.ENABLE_SPREADSHEET_WORKER === 'true') {
  const drainDelay = parseInt(process.env.SPREADSHEET_WORKER_DRAIN_DELAY || '60', 10);
  const stalledInterval = parseInt(process.env.SPREADSHEET_WORKER_STALLED_INTERVAL || '300000', 10);

  spreadsheetWorker = new Worker(
    'spreadsheet-sync',
    async (job) => {
      logger.info('SpreadsheetWorker', `Processing background sync job: ${job.name} (id: ${job.id})`);

      const { connectionId } = job.data;
      if (!connectionId) {
        throw new Error('Sync job missing connectionId in payload');
      }

      try {
        const stats = await syncSpreadsheetLeads(connectionId);
        logger.info('SpreadsheetWorker', `Successfully synced connection ${connectionId}`, { ...stats });
        return stats;
      } catch (err: any) {
        logger.error('SpreadsheetWorker', `Failed to sync connection ${connectionId}`, {
          error: err.message,
          stack: err.stack,
        });
        throw err;
      }
    },
    {
      connection: connection as any,
      drainDelay,
      stalledInterval,
    }
  );

  // Worker Event Logging
  spreadsheetWorker.on('completed', (job) => {
    logger.info('SpreadsheetWorker', `Job ${job.id} completed successfully`);
  });

  spreadsheetWorker.on('failed', (job, err) => {
    logger.error('SpreadsheetWorker', `Job ${job?.id} failed`, { error: err.message });
  });

  spreadsheetWorker.on('error', (err) => {
    logger.error('SpreadsheetWorker', 'Worker encountered a system error', { error: err.message });
  });
}


// --- Repeatable Job Schedulers ---

/**
 * Registers/Updates a repeatable background spreadsheet sync job.
 */
export async function addSpreadsheetSyncJob(connectionId: string, intervalSeconds: number) {
  try {
    // 1. Clear any existing repeatable job for this connection to prevent duplicates
    await removeSpreadsheetSyncJob(connectionId);

    // 2. Add the repeatable job with millisecond interval
    await spreadsheetQueue.add(
      'sync-spreadsheet-job',
      { connectionId },
      {
        repeat: { every: intervalSeconds * 1000 },
        jobId: connectionId,
      }
    );

    logger.info('SpreadsheetQueue', 'Registered repeatable spreadsheet sync job', {
      connectionId,
      intervalSeconds,
    });
  } catch (err: any) {
    logger.error('SpreadsheetQueue', 'Failed to register repeatable job', {
      connectionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Helper to fetch a repeatable job's payload directly from Redis
 * and extract the connectionId. Fallbacks to jobId if present.
 */
async function getConnectionIdForJob(jobKey: string, jobIdFallback?: string | null): Promise<string | null> {
  try {
    const redisKey = `bull:spreadsheet-sync:repeat:${jobKey}`;
    const hashData = await connection.hgetall(redisKey);
    if (hashData && hashData.data) {
      const parsed = JSON.parse(hashData.data);
      if (parsed && parsed.connectionId) {
        return parsed.connectionId;
      }
    }
  } catch {}
  return jobIdFallback || null;
}

/**
 * Removes a repeatable background spreadsheet sync job.
 */
export async function removeSpreadsheetSyncJob(connectionId: string) {
  try {
    const repeatableJobs = await spreadsheetQueue.getRepeatableJobs();
    
    let targetKey: string | null = null;
    for (const job of repeatableJobs) {
      const jobConnectionId = await getConnectionIdForJob(job.key, job.id);
      if (jobConnectionId === connectionId) {
        targetKey = job.key;
        break;
      }
    }
    
    if (targetKey) {
      await spreadsheetQueue.removeRepeatableByKey(targetKey);
      logger.info('SpreadsheetQueue', 'Removed repeatable spreadsheet sync job', { connectionId });
    } else {
      logger.warn('SpreadsheetQueue', 'Repeatable spreadsheet sync job not found for removal', { connectionId });
    }
  } catch (err: any) {
    logger.error('SpreadsheetQueue', 'Failed to remove repeatable job', {
      connectionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Scans all repeatable jobs in the spreadsheet queue and removes any whose
 * spreadsheet connection record no longer exists in the database.
 */
export async function cleanupOrphanedSpreadsheetJobs() {
  try {
    logger.info('SpreadsheetQueue', 'Running startup cleanup scanner for orphaned spreadsheet repeatable jobs...');
    const repeatableJobs = await spreadsheetQueue.getRepeatableJobs();
    
    let cleanupCount = 0;
    for (const job of repeatableJobs) {
      const connectionId = await getConnectionIdForJob(job.key, job.id);
      if (!connectionId) continue;
      
      const connectionExists = await runBypassingTenant(async () => {
        return prisma.spreadsheetConnection.findUnique({
          where: { id: connectionId },
        });
      });
      
      if (!connectionExists) {
        logger.warn('SpreadsheetQueue', `[Queue Cleanup] Stale repeatable job found for missing connection ${connectionId}. Removing...`);
        await spreadsheetQueue.removeRepeatableByKey(job.key);
        logger.info('SpreadsheetQueue', `[Queue Cleanup] Successfully removed orphaned repeatable job for connection ${connectionId}`);
        cleanupCount++;
      }
    }
    
    logger.info('SpreadsheetQueue', `Startup cleanup completed. Removed ${cleanupCount} orphaned repeatable job(s).`);
  } catch (err: any) {
    logger.error('SpreadsheetQueue', 'Failed to run startup cleanup scanner for orphaned spreadsheet repeatable jobs', {
      error: err.message,
    });
  }
}

