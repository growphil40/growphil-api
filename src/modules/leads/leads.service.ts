import prisma from '../../config/db';

/**
 * Lists leads scoped to the active tenant, with filters and pagination.
 */
export async function getLeadsList(
  filters: { stage?: string; assignedTo?: string; search?: string; source?: string; city?: string; startDate?: string; endDate?: string; clientId?: string },
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit;

  // Build filters (Prisma middleware automatically scopes by tenantId)
  const where: any = {};

  if (filters.clientId) {
    where.clientId = filters.clientId;
  }
  
  if (filters.stage) {
    where.stage = filters.stage;
  }
  
  if (filters.assignedTo) {
    where.assignedTo = filters.assignedTo;
  }

  if (filters.source) {
    where.source = { contains: filters.source, mode: 'insensitive' };
  }

  if (filters.city) {
    where.city = { contains: filters.city, mode: 'insensitive' };
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }
  
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedUser: {
          select: { id: true, email: true, role: true },
        },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return { leads, total };
}

/**
 * Fetches a single lead with full history (follow-ups, activity logs, sales).
 */
export async function getLeadById(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      followUps: {
        orderBy: { scheduledAt: 'asc' },
      },
      activityLogs: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, role: true },
          },
        },
      },
      sales: {
        orderBy: { closedAt: 'desc' },
      },
      assignedUser: {
        select: { id: true, email: true, role: true },
      },
    },
  });
}

/**
 * Updates the pipeline stage of a lead and logs it to activity logs.
 */
export async function updateLeadStage(leadId: string, newStage: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch lead details
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const oldStage = lead.stage;

    // 2. Perform update
    const updatedLead = await tx.lead.update({
      where: { id: leadId },
      data: { stage: newStage as any },
    });

    // 3. Log action to activity logs
    await tx.activityLog.create({
      data: {
        leadId,
        userId,
        action: 'stage_change',
        oldValue: oldStage,
        newValue: newStage,
        clientId: lead.clientId,
        agencyId: lead.agencyId,
      },
    });

    return { lead: updatedLead, oldStage, newStage };
  });
}

/**
 * Adds a custom note to a lead's activity log.
 */
export async function addLeadNote(leadId: string, noteText: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch lead
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // 2. Create activity log entry for the note
    const logRecord = await tx.activityLog.create({
      data: {
        leadId,
        userId,
        action: 'note',
        oldValue: null,
        newValue: noteText,
        clientId: lead.clientId,
        agencyId: lead.agencyId,
      },
    });

    return logRecord;
  });
}

/**
 * Deletes a lead by ID.
 */
export async function deleteLeadById(leadId: string) {
  return prisma.lead.delete({
    where: { id: leadId },
  });
}

/**
 * Deletes multiple leads by IDs.
 */
export async function deleteLeadsByIds(leadIds: string[]) {
  return prisma.lead.deleteMany({
    where: { id: { in: leadIds } },
  });
}
