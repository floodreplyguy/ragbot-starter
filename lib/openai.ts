import OpenAI from 'openai';

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
export const CHAT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

if (!process.env.OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY is not set. API routes that rely on OpenAI will fail.');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
