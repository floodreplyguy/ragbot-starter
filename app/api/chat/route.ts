import { OpenAIStream, StreamingTextResponse } from 'ai';
import { CHAT_MODEL, EMBEDDING_MODEL, openai } from '@/lib/openai';
import { getTradeCollection } from '@/lib/astra';
import type { TradeEntry } from '@/types/trade';
import { buildEmbeddingText } from '@/lib/trade-helpers';

const toTrade = (document: TradeEntry & { $vector?: number[]; document_id?: string }) => {
  const { $vector: _vector, document_id: _docId, ...rest } = document;
  return rest;
};

export async function POST(req: Request) {
  try {
    const { messages, useRag = true } = await req.json();

    const latestMessage = messages?.[messages.length - 1]?.content ?? '';

    let context = '';
    if (useRag && latestMessage) {
      const { data } = await openai.embeddings.create({ input: latestMessage, model: EMBEDDING_MODEL });
      const collection = await getTradeCollection();
      const cursor = await collection.find({}, {
        sort: { $vector: data?.[0]?.embedding },
        limit: 6,
      });
      const documents = await cursor.toArray();
      const trades = documents.map((document) => toTrade(document as TradeEntry));
      if (trades.length) {
        const formatted = trades.map((trade, index) => `Trade ${index + 1}: ${buildEmbeddingText(trade)}`).join('\n---\n');
        context = `Relevant trades:\n${formatted}`;
      }
    }

    const systemPrompt = `You are Neon Scribe, an AI mentor embedded inside a retro-futuristic trading notebook.
You help the user reflect on their trades, performance patterns, and emotional state.
Use markdown where helpful and reference the journal context when it is available.
If you do not have enough information, invite the user to add more detail to their journal.`;

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      stream: true,
      temperature: 0.3,
      messages: [
        { role: 'system', content: `${systemPrompt}\n${context}` },
        ...messages,
      ],
    });

    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error('Chat endpoint failed', error);
    throw error;
  }
}
