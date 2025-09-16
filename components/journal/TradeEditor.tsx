'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { TradeAttachment, TradeEntry, TradeStatus, TradeType } from '@/types/trade';
import clsx from 'clsx';
import { formatDateTime } from '@/lib/format';

interface TradeEditorProps {
  trade: TradeEntry;
  onClose: () => void;
  onSave: (payload: {
    trade: Partial<TradeEntry>;
    note?: string;
    attachments?: TradeAttachment[];
    removeAttachmentIds?: string[];
    reanalyze?: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const toInputValue = (value?: number | null) => (value ?? value === 0 ? String(value) : '');

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export default function TradeEditor({ trade, onClose, onSave, isSaving }: TradeEditorProps) {
  const [formState, setFormState] = useState({
    ticker: trade.ticker,
    trade_type: trade.trade_type,
    size: toInputValue(trade.size),
    entry_price: toInputValue(trade.entry_price),
    exit_price: toInputValue(trade.exit_price),
    pnl_pct: toInputValue(trade.pnl_pct),
    pnl_usd: toInputValue(trade.pnl_usd),
    rr_ratio: toInputValue(trade.rr_ratio),
    duration_minutes: toInputValue(trade.duration_minutes),
    sentiment: trade.sentiment ?? '',
    status: trade.status,
    opened_at: trade.opened_at ?? '',
    closed_at: trade.closed_at ?? '',
  });
  const [note, setNote] = useState('');
  const [reanalyze, setReanalyze] = useState(false);
  const [newAttachments, setNewAttachments] = useState<TradeAttachment[]>([]);
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<string[]>([]);

  const existingAttachments = useMemo(
    () => trade.attachments.filter((attachment) => !removeAttachmentIds.includes(attachment.id)),
    [trade.attachments, removeAttachmentIds],
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    const processed = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        dataUrl: await readFileAsDataUrl(file),
      })),
    );
    setNewAttachments((prev) => [...prev, ...processed]);
  };

  const markAttachmentForRemoval = (id: string) => {
    setRemoveAttachmentIds((prev) => [...prev, id]);
  };

  const removeNewAttachment = (id: string) => {
    setNewAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload: Partial<TradeEntry> = {
      ticker: formState.ticker,
      trade_type: formState.trade_type as TradeType,
      size: toNumberOrNull(formState.size) ?? undefined,
      entry_price: toNumberOrNull(formState.entry_price) ?? undefined,
      exit_price: toNumberOrNull(formState.exit_price) ?? undefined,
      pnl_pct: toNumberOrNull(formState.pnl_pct) ?? undefined,
      pnl_usd: toNumberOrNull(formState.pnl_usd) ?? undefined,
      rr_ratio: toNumberOrNull(formState.rr_ratio) ?? undefined,
      duration_minutes: toNumberOrNull(formState.duration_minutes) ?? undefined,
      sentiment: formState.sentiment.trim() || null,
      status: formState.status as TradeStatus,
      opened_at: formState.opened_at || null,
      closed_at: formState.status === 'closed' ? formState.closed_at || null : null,
    };

    await onSave({
      trade: payload,
      note: note.trim() || undefined,
      attachments: newAttachments,
      removeAttachmentIds,
      reanalyze,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-3xl rounded-xl border border-[#1b3535] bg-[#071312]/95 p-6 shadow-holo"
      >
        <header className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-xl uppercase tracking-[0.35em] text-neon">Edit Trade</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Trade #{trade.trade_id}</p>
            <p className="mt-1 text-[11px] text-muted/80">
              Created {formatDateTime(trade.createdAt)} • Last update {formatDateTime(trade.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#1b3535] px-3 py-1 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-neon hover:text-neon"
          >
            Close
          </button>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Ticker
            <input
              name="ticker"
              value={formState.ticker}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Trade Type
            <select
              name="trade_type"
              value={formState.trade_type}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Size
            <input
              name="size"
              value={formState.size}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Entry Price
            <input
              name="entry_price"
              value={formState.entry_price}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Exit Price
            <input
              name="exit_price"
              value={formState.exit_price}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            PnL (USD)
            <input
              name="pnl_usd"
              value={formState.pnl_usd}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            PnL (%)
            <input
              name="pnl_pct"
              value={formState.pnl_pct}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Risk / Reward
            <input
              name="rr_ratio"
              value={formState.rr_ratio}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Duration (minutes)
            <input
              name="duration_minutes"
              value={formState.duration_minutes}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Sentiment
            <input
              name="sentiment"
              value={formState.sentiment}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Status
            <select
              name="status"
              value={formState.status}
              onChange={handleChange}
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Opened At
            <input
              name="opened_at"
              type="datetime-local"
              value={formState.opened_at ? formState.opened_at.slice(0, 16) : ''}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, opened_at: event.target.value ? new Date(event.target.value).toISOString() : '' }))
              }
              className="rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.25em] text-muted">
            Closed At
            <input
              name="closed_at"
              type="datetime-local"
              value={formState.closed_at ? formState.closed_at.slice(0, 16) : ''}
              onChange={(event) =>
                setFormState((prev) => ({ ...prev, closed_at: event.target.value ? new Date(event.target.value).toISOString() : '' }))
              }
              disabled={formState.status !== 'closed'}
              className={clsx(
                'rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon',
                formState.status !== 'closed' && 'opacity-50',
              )}
            />
          </label>
        </section>

        <section className="mt-6">
          <h3 className="text-[11px] uppercase tracking-[0.35em] text-muted">Add Note</h3>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record additional context, outcomes, or mindset..."
            className="mt-2 h-28 w-full rounded-md border border-[#1f3c3c] bg-black/40 px-3 py-2 text-sm text-mint outline-none focus:border-neon"
          />
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted">
            <input
              type="checkbox"
              checked={reanalyze}
              onChange={(event) => setReanalyze(event.target.checked)}
            />
            Ask AI to refine metrics using this note
          </label>
        </section>

        <section className="mt-6 space-y-4">
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.35em] text-muted">Existing Attachments</h3>
            {existingAttachments.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No attachments stored for this trade.</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
                {existingAttachments.map((attachment) => (
                  <figure key={attachment.id} className="relative overflow-hidden rounded-md border border-[#1f3c3c] bg-black/30">
                    <Image
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      width={280}
                      height={120}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                    <figcaption className="px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-muted">
                      {attachment.name}
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => markAttachmentForRemoval(attachment.id)}
                      className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-neon"
                    >
                      Remove
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.35em] text-muted">Add Attachments</h3>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleAttachmentUpload}
              className="mt-2 text-xs text-muted"
            />
            {newAttachments.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {newAttachments.map((attachment) => (
                  <figure key={attachment.id} className="relative overflow-hidden rounded-md border border-[#1f3c3c] bg-black/30">
                    <Image
                      src={attachment.dataUrl}
                      alt={attachment.name}
                      width={280}
                      height={120}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                    <figcaption className="px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-muted">
                      {attachment.name}
                    </figcaption>
                    <button
                      type="button"
                      onClick={() => removeNewAttachment(attachment.id)}
                      className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-neon"
                    >
                      Remove
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#1f3c3c] px-4 py-2 text-xs uppercase tracking-[0.3em] text-muted transition hover:border-neon hover:text-neon"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className={clsx(
              'rounded-md bg-neon/80 px-5 py-2 text-xs font-bold uppercase tracking-[0.35em] text-ink transition hover:bg-neon',
              isSaving && 'opacity-50',
            )}
          >
            Save Changes
          </button>
        </footer>
      </form>
    </div>
  );
}
