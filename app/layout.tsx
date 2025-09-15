import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

export const metadata = {
  title: 'Neon Trade Journal',
  description:
    'A retro-futuristic AI trading journal with structured logging, analytics, and RAG-powered search.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="bg-radial">{children}</body>
    </html>
  );
}
