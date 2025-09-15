import { AstraDB } from '@datastax/astra-db-ts';

const {
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_NAMESPACE,
} = process.env;

if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE) {
  console.warn('Astra DB environment variables are missing. Database operations will fail.');
}

export const TRADE_COLLECTION_NAME = process.env.ASTRA_DB_TRADE_COLLECTION ?? 'trades_journal_v1';

export const astraDb = new AstraDB(
  ASTRA_DB_APPLICATION_TOKEN,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_NAMESPACE,
);

export type TradeCollection = Awaited<ReturnType<AstraDB['collection']>>;

export const getTradeCollection = async (): Promise<TradeCollection> => {
  return astraDb.collection(TRADE_COLLECTION_NAME);
};
