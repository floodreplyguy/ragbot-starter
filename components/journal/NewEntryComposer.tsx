'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { TradeAttachment } from '@/types/trade';
import clsx from 'clsx';

export interface ComposerAttachment extends TradeAttachment {}

interface NewEntryComposerProps {
  onSubmit: (payload: { note: string; attachments: ComposerAttachment[] }) => Promise<void>;
  isProcessing: boolean;
}

const MAX_ATTACHMENTS = 4;

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function NewEntryComposer({ onSubmit, isProcessing }: NewEntryComposerProps) {
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecordingSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) {
        setNote((prev) => `${prev ? `${prev} ` : ''}${transcript}`);
      }
    };
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (error) {
          // ignore cleanup errors
        }
      }
    };
  }, []);

  const handleStartRecording = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (error) {
      setRecordingSupported(false);
      console.error('Voice capture failed', error);
    }
  };

  const handleStopRecording = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (error) {
      console.error('Failed to stop recording', error);
    }
  };

  const handleAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    const allowedSlots = MAX_ATTACHMENTS - attachments.length;
    const selected = Array.from(files).slice(0, allowedSlots);

    const processed = await Promise.all(
      selected.map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );

    setAttachments((prev) => [...prev, ...processed]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    await onSubmit({ note: note.trim(), attachments });
    setNote('');
    setAttachments([]);
  };

  const resetForm = () => {
    setNote('');
    setAttachments([]);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="retro-panel flex flex-col gap-4 p-4"
      aria-label="New journal entry"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-neon font-semibold tracking-wide">New Journal Entry</h2>
        <button
          type="button"
          className="text-xs uppercase tracking-[0.2em] text-muted hover:text-neon transition"
          onClick={resetForm}
        >
          Reset
        </button>
      </div>
      <textarea
        className="min-h-[160px] w-full resize-y rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint shadow-inner outline-none focus:border-neon focus:ring-1 focus:ring-neon/60"
        placeholder="Drop your trade recap, emotions, and plans here..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!recordingSupported || isProcessing}
          className={clsx(
            'flex items-center gap-2 rounded-md border border-[#1f3c3c] px-3 py-2 text-xs uppercase tracking-widest transition',
            isRecording ? 'bg-neon/20 text-neon shadow-glow' : 'bg-black/40 text-mint hover:border-neon hover:text-neon',
            (!recordingSupported || isProcessing) && 'opacity-50',
          )}
        >
          {isRecording ? 'Stop Recording' : 'Voice Capture'}
        </button>
        <label
          className={clsx(
            'flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[#1f3c3c] px-3 py-2 text-xs uppercase tracking-widest transition hover:border-neon hover:text-neon',
            attachments.length >= MAX_ATTACHMENTS && 'cursor-not-allowed opacity-40',
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleAttachmentChange}
            disabled={attachments.length >= MAX_ATTACHMENTS}
          />
          Attach Image
        </label>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
            {note.trim().length} chars
          </span>
          <button
            type="submit"
            disabled={!note.trim() || isProcessing}
            className={clsx(
              'rounded-md bg-neon/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-black transition hover:bg-neon',
              (!note.trim() || isProcessing) && 'opacity-50',
            )}
          >
            Log Trade
          </button>
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative overflow-hidden rounded-md border border-[#1f3c3c] bg-black/30 p-2"
            >
              <Image
                src={attachment.dataUrl}
                alt={attachment.name}
                width={320}
                height={128}
                unoptimized
                className="h-32 w-full rounded-sm object-cover"
              />
              <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-muted">
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="text-neon hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {!recordingSupported && (
        <p className="text-xs text-amber-400">
          Voice capture is not available in this browser. Try a modern Chromium-based browser to enable
          microphone journaling.
        </p>
      )}
    </form>
  );
}
