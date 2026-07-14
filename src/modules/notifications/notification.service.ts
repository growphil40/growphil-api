import { notificationsQueue } from './notification.queue';
import { logger } from '../../utils/logger';

/**
 * Publishes a lead creation notification event into the BullMQ background queue.
 */
export async function publishLeadCreated(leadId: string, clientId: string): Promise<boolean> {
  try {
    if (!notificationsQueue) {
      logger.warn('NotificationService', 'notificationsQueue is disabled or null. Event skipped.', { leadId, clientId });
      return false;
    }

    logger.info('NotificationService', 'Publishing lead:created notification event', { leadId, clientId });
    
    // Add job to BullMQ queue
    await notificationsQueue.add(
      'notify-lead-created',
      { leadId, clientId },
      {
        jobId: `lead-create-${leadId}`, // Deduplicate at queue level to avoid multiple runs for the same lead
      }
    );

    return true;
  } catch (err: any) {
    logger.error('NotificationService', 'Failed to publish lead created event to queue', { error: err.message, leadId });
    return false;
  }
}
