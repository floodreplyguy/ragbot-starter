import { AstraDB } from '@datastax/astra-db-ts';
import type { TradeDocument } from '../types/trade';

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

export const getTradeCollection = async () => {
  return astraDb.collection<TradeDocument>(TRADE_COLLECTION_NAME);
};
