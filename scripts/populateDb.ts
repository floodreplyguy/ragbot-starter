import { AstraDB } from '@datastax/astra-db-ts';
import 'dotenv/config';
import OpenAI from 'openai';
import sampleTrades from './sample_trades.json';
import { TRADE_COLLECTION_NAME, TradeCollection } from '../lib/astra';
import { EMBEDDING_MODEL } from '../lib/openai';
import { buildEmbeddingText } from '../lib/trade-helpers';
import type { TradeEntry } from '../types/trade';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const { ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_API_ENDPOINT, ASTRA_DB_NAMESPACE } = process.env;

if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE) {
  console.error('Missing Astra DB configuration. Set ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_API_ENDPOINT, and ASTRA_DB_NAMESPACE');
  process.exit(1);
}

const astraDb = new AstraDB(ASTRA_DB_APPLICATION_TOKEN, ASTRA_DB_API_ENDPOINT, ASTRA_DB_NAMESPACE);

const createTradeCollection = async () => {
  try {
    await astraDb.createCollection(TRADE_COLLECTION_NAME, {
      vector: {
        dimension: 3072,
        metric: 'cosine',
      },
    });
    console.log(`Created collection ${TRADE_COLLECTION_NAME}`);
  } catch (error) {
    console.log(`Collection ${TRADE_COLLECTION_NAME} already exists.`);
  }
};

const seedTrades = async () => {
  const collection = (await astraDb.collection(TRADE_COLLECTION_NAME)) as TradeCollection;
  for await (const trade of sampleTrades as TradeEntry[]) {
    try {
      const { data } = await openai.embeddings.create({
        input: buildEmbeddingText(trade),
        model: EMBEDDING_MODEL,
      });

      await collection.insertOne({
        document_id: trade.trade_id,
        ...trade,
        $vector: data?.[0]?.embedding,
      } as any);
      console.log(`Inserted trade ${trade.trade_id}`);
    } catch (error) {
      console.error(`Failed to insert trade ${trade.trade_id}`, error);
    }
  }
};

createTradeCollection().then(seedTrades);
