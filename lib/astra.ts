import { AstraDB } from '@datastax/astra-db-ts';

const {
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_NAMESPACE,
} = process.env;

export const TRADE_COLLECTION_NAME = process.env.ASTRA_DB_TRADE_COLLECTION ?? 'trades_journal_v1';

let astraDb: AstraDB | null = null;
let hasLoggedMissingEnv = false;

const getDb = (): AstraDB | null => {
  if (astraDb) {
    return astraDb;
  }

  const missingVars: string[] = [];
  if (!ASTRA_DB_APPLICATION_TOKEN) missingVars.push('ASTRA_DB_APPLICATION_TOKEN');
  if (!ASTRA_DB_API_ENDPOINT) missingVars.push('ASTRA_DB_API_ENDPOINT');
  if (!ASTRA_DB_NAMESPACE) missingVars.push('ASTRA_DB_NAMESPACE');

  if (missingVars.length > 0) {
    if (!hasLoggedMissingEnv) {
      console.error(
        `Astra DB environment variables are missing: ${missingVars.join(', ')}. Database operations are disabled.`,
      );
      hasLoggedMissingEnv = true;
    }
    return null;
  }

  astraDb = new AstraDB(ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_API_ENDPOINT, ASTRA_DB_NAMESPACE);
  return astraDb;
};

export type TradeCollection = Awaited<ReturnType<AstraDB['collection']>>;

export const getTradeCollection = async (): Promise<TradeCollection | null> => {
  const db = getDb();
  if (!db) {
    return null;
  }
  return db.collection(TRADE_COLLECTION_NAME);
};

export const ASTRA_DB_MISSING_ENV_MESSAGE =
  'Astra DB is not configured. Please set ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_API_ENDPOINT, and ASTRA_DB_NAMESPACE environment variables.';
