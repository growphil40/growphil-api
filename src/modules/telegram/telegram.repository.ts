import prisma from '../../config/db';

const db = prisma as any;

export async function getIntegrationsByClientId(clientId: string) {
  return db.telegramIntegration.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getIntegrationById(id: string) {
  return db.telegramIntegration.findUnique({
    where: { id },
  });
}

export async function upsertIntegration(
  clientId: string,
  botToken: string,
  botUsername: string,
  botName: string
) {
  return db.telegramIntegration.upsert({
    where: {
      clientId_botUsername: {
        clientId,
        botUsername,
      },
    },
    update: {
      botToken,
      botName,
      isConnected: true,
    },
    create: {
      clientId,
      botToken,
      botUsername,
      botName,
      isConnected: true,
    },
  });
}

export async function deleteIntegrationById(clientId: string, id: string) {
  return db.telegramIntegration.delete({
    where: { id, clientId },
  });
}

export async function getRecipientsByClientId(clientId: string) {
  return db.telegramRecipient.findMany({
    where: { clientId },
    orderBy: { connectedAt: 'desc' },
  });
}

export async function upsertRecipient(
  clientId: string,
  integrationId: string,
  chatId: string,
  username?: string | null,
  firstName?: string | null,
  lastName?: string | null
) {
  return db.telegramRecipient.upsert({
    where: {
      integrationId_chatId: {
        integrationId,
        chatId,
      },
    },
    update: {
      username,
      firstName,
      lastName,
      isActive: true,
    },
    create: {
      clientId,
      integrationId,
      chatId,
      username,
      firstName,
      lastName,
      isActive: true,
    },
  });
}

export async function markRecipientInactive(integrationId: string, chatId: string) {
  return db.telegramRecipient.update({
    where: {
      integrationId_chatId: {
        integrationId,
        chatId,
      },
    },
    data: {
      isActive: false,
    },
  });
}

export async function deleteRecipientById(clientId: string, recipientId: string) {
  return db.telegramRecipient.delete({
    where: {
      id: recipientId,
      clientId,
    },
  });
}

export async function getPreferenceByClientId(clientId: string) {
  return db.notificationPreference.findUnique({
    where: { clientId },
  });
}

export async function upsertPreference(clientId: string, telegramEnabled: boolean) {
  return db.notificationPreference.upsert({
    where: { clientId },
    update: {
      telegramEnabled,
    },
    create: {
      clientId,
      telegramEnabled,
    },
  });
}
