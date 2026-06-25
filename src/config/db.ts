import { PrismaClient } from '@prisma/client';
import { getTenantContext } from '../utils/tenant-context';
import { encrypt, decrypt } from '../utils/encryption';

const prisma = new PrismaClient();

// Mapping of models to their respective tenant fields
const modelTenantFields: Record<string, { agencyField?: string; clientField?: string; selfIdField?: string }> = {
  Agency: { selfIdField: 'id' },
  Client: { agencyField: 'agencyId', clientField: 'id' },
  User: { agencyField: 'agencyId', clientField: 'clientId' },
  Lead: { agencyField: 'agencyId', clientField: 'clientId' },
  FollowUp: { agencyField: 'agencyId', clientField: 'clientId' },
  Sale: { agencyField: 'agencyId', clientField: 'clientId' },
  ActivityLog: { agencyField: 'agencyId', clientField: 'clientId' },
  RefreshToken: { agencyField: 'agencyId', clientField: 'clientId' },
  GoogleConnection: { clientField: 'clientId' },
  SpreadsheetConnection: { clientField: 'clientId' },
  SpreadsheetColumnMapping: { clientField: 'clientId' },
  SpreadsheetImportHistory: { clientField: 'clientId' },
};

prisma.$use(async (params, next) => {
  const modelName = params.model as string;
  if (!modelName) {
    return next(params);
  }

  const mapping = modelTenantFields[modelName];
  if (!mapping) {
    return next(params);
  }

  const context = getTenantContext();

  // If bypass is active, skip all checks
  if (context?.bypass) {
    return next(params);
  }

  // 1. Enforce that tenant context exists
  if (!context || (!context.agencyId && !context.clientId)) {
    throw new Error(
      `Multi-tenancy violation: Query executed on '${modelName}' without an active tenant context (agencyId or clientId).`
    );
  }

  const { agencyId, clientId } = context;

  // 2. Handle Encrypted Fields for Writes
  if (modelName === 'Client' && params.args?.data) {
    const data = params.args.data;
    if (data.metaAccessToken) {
      data.metaAccessToken = encrypt(data.metaAccessToken);
    }
  }

  if (modelName === 'GoogleConnection' && params.args?.data) {
    const data = params.args.data;
    if (data.accessToken) {
      data.accessToken = encrypt(data.accessToken);
    }
    if (data.refreshToken) {
      data.refreshToken = encrypt(data.refreshToken);
    }
  }

  // 3. Inject Tenant Filters for Reads and Writes
  const readActions = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'];
  const writeActions = ['update', 'updateMany', 'delete', 'deleteMany'];
  const createActions = ['create', 'createMany'];

  if (readActions.includes(params.action) || writeActions.includes(params.action)) {
    // If findUnique, convert to findFirst so we can add tenant filters
    if (params.action === 'findUnique') {
      params.action = 'findFirst';
    }

    params.args = params.args || {};
    params.args.where = params.args.where || {};

    if (mapping.selfIdField && agencyId) {
      // e.g. Agency table itself
      params.args.where[mapping.selfIdField] = agencyId;
    } else {
      // Standard table
      if (clientId && mapping.clientField) {
        // Client-scoped query (e.g. client user logged in)
        params.args.where[mapping.clientField] = clientId;
      } else if (agencyId && mapping.agencyField) {
        // Agency-scoped query (e.g. agency user logged in)
        params.args.where[mapping.agencyField] = agencyId;
      } else {
        throw new Error(
          `Multi-tenancy violation: Mismatch between context keys (agencyId: ${agencyId}, clientId: ${clientId}) and model '${modelName}' tenant fields.`
        );
      }
    }
  } else if (createActions.includes(params.action)) {
    // Inject tenant ID on creation
    params.args = params.args || {};
    
    const applyTenantToData = (dataObj: any) => {
      if (!dataObj) return;
      
      if (mapping.selfIdField) {
        if (agencyId) dataObj[mapping.selfIdField] = agencyId;
      } else {
        if (clientId && mapping.clientField) {
          dataObj[mapping.clientField] = clientId;
        }
        if (agencyId && mapping.agencyField) {
          dataObj[mapping.agencyField] = agencyId;
        }
      }
    };

    if (params.action === 'createMany') {
      if (Array.isArray(params.args.data)) {
        params.args.data.forEach(applyTenantToData);
      }
    } else {
      applyTenantToData(params.args.data);
    }
  }

  // 4. Execute Query
  const result = await next(params);

  // 5. Handle Encrypted Fields Decryption for Client Reads
  if (modelName === 'Client' && result) {
    const decryptClient = (clientObj: any) => {
      if (clientObj && clientObj.metaAccessToken) {
        try {
          clientObj.metaAccessToken = decrypt(clientObj.metaAccessToken);
        } catch (error) {
          console.error(`Failed to decrypt metaAccessToken for Client ID ${clientObj.id}:`, error);
        }
      }
    };

    if (Array.isArray(result)) {
      result.forEach(decryptClient);
    } else {
      decryptClient(result);
    }
  }

  if (modelName === 'GoogleConnection' && result) {
    const decryptGoogle = (connObj: any) => {
      if (connObj) {
        if (connObj.accessToken) {
          try {
            connObj.accessToken = decrypt(connObj.accessToken);
          } catch (error) {
            console.error(`Failed to decrypt accessToken for GoogleConnection ID ${connObj.id}:`, error);
          }
        }
        if (connObj.refreshToken) {
          try {
            connObj.refreshToken = decrypt(connObj.refreshToken);
          } catch (error) {
            console.error(`Failed to decrypt refreshToken for GoogleConnection ID ${connObj.id}:`, error);
          }
        }
      }
    };

    if (Array.isArray(result)) {
      result.forEach(decryptGoogle);
    } else {
      decryptGoogle(result);
    }
  }

  return result;
});

export default prisma;
export { prisma };
