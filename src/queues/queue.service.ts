import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../utils/redis';

// Demo Lead Sync Queue
export const leadSyncQueue = new Queue('lead-sync', {
  connection: redisConnection as any
});

// Demo worker setup
export const leadSyncWorker = new Worker('lead-sync', async (job) => {
  console.log(`Processing lead sync job ${job.id}:`, job.data);
  // Implementation of lead processing logic from Meta/other sources goes here.
}, {
  connection: redisConnection as any
});

leadSyncWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

leadSyncWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error:`, err);
});
