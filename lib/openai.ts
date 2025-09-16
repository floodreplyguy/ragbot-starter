import OpenAI from 'openai';

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-large';
export const CHAT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('OPENAI_API_KEY is not set. API routes that rely on OpenAI will fall back to heuristics.');
}

export const openai = apiKey ? new OpenAI({ apiKey }) : null;
