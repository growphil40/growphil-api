import prisma from '../../config/db';
import { FollowUpStatus } from '@prisma/client';

/**
 * Schedules a new follow-up for a lead, inheriting tenant scope parameters.
 */
export async function scheduleFollowUp(leadId: string, scheduledAt: Date, note?: string) {
  return prisma.$transaction(async (tx) => {
    // Validate lead belongs to the active tenant and exists
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Create follow-up record
    const followUp = await tx.followUp.create({
      data: {
        leadId,
        scheduledAt,
        note: note || null,
        clientId: lead.clientId,
        agencyId: lead.agencyId,
        status: 'pending',
      },
    });

    return followUp;
  });
}

/**
 * Retrieves follow-ups, optionally filtered by status.
 */
export async function getFollowUps(status?: FollowUpStatus, clientId?: string) {
  return prisma.followUp.findMany({
    where: {
      ...(status && { status }),
      ...(clientId && { clientId }),
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          stage: true,
        },
      },
    },
    orderBy: {
      scheduledAt: 'asc',
    },
  });
}

/**
 * Marks a follow-up as complete.
 */
export async function completeFollowUp(id: string) {
  const followUp = await prisma.followUp.findUnique({
    where: { id },
  });

  if (!followUp) {
    throw new Error('Follow-up not found');
  }

  return prisma.followUp.update({
    where: { id },
    data: {
      status: 'done',
      completedAt: new Date(),
    },
  });
}
