'use client';

/**
 * "AI Asistan" ekranı (design_handoff_bistai/bistAI Sayfalar.dc.html) — hi-fi.
 * Sohbet: AI baloncuğu (beyaz, sol) + kullanıcı baloncuğu (ink, sağ) + öneri çipleri + input.
 * Streaming KORUNDU (POST /api/chat → SSE). Açık tema.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatContext } from '@/app/api/chat/route';

const SUGGESTIONS = [
  'Portföyümü analiz et',
  'Bugün hangi hisselere dikkat etmeliyim?',
  'Piyasanın genel görünümü nasıl?',
  'Hangi sektörler güçlü?',
];

export function AiAsistanScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamText, setStreamText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setLoading(true);
    setStreamText('');
    const context: ChatContext = {};
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Bir hata oluştu. (Sohbet için giriş gerekebilir.)');
        setLoading(false);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream alınamadı.');
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.error) { setError(p.error); break; }
            if (p.text) { acc += p.text; setStreamText(acc); }
          } catch { /* parse */ }
        }
      }
      if (acc) setMessages([...newMessages, { role: 'assistant', content: acc }]);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError('Bağlantı hatası.');
    } finally {
      setLoading(false);
      setStreamText('');
    }
  }

  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col lg:h-[calc(100vh-68px)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-hairline px-6 py-3.5 lg:px-7">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-ai-panel font-mono text-[15px] font-bold text-ai">✦</span>
        <div>
          <div className="text-[15px] font-extrabold tracking-[-0.02em] text-ink">AI Asistan</div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-up">
            <span className="h-[6px] w-[6px] rounded-full bg-up" /> Çevrimiçi · canlı piyasa verisine bağlı
          </div>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto px-6 py-5 lg:px-7">
        {empty ? (
          <div className="mx-auto max-w-[640px] pt-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-ai-panel font-mono text-[24px] font-bold text-ai">✦</span>
            <p className="mt-4 text-[16px] font-bold text-ink">Piyasa hakkında ne öğrenmek istersin?</p>
            <p className="mt-1 text-[13px] font-medium text-t3">Canlı veriye bağlı; kural-tabanlı analizi sade dille açıklar.</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[680px] flex-col gap-3.5">
            {messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)}
            {loading && <Bubble role="assistant" content={streamText || '…'} />}
            {error && <div className="self-center rounded-[12px] bg-down/10 px-3 py-2 text-[12px] font-medium text-down">{error}</div>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Alt giriş */}
      <div className="border-t border-hairline px-6 py-3.5 lg:px-7">
        <div className="mx-auto max-w-[680px]">
          {empty && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-fill px-3 py-1.5 text-[12px] font-semibold text-t2 hover:text-ink">{s}</button>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Bir soru sor…"
              className="flex-1 rounded-[14px] border border-hairline bg-fill px-4 py-3 text-[14px] text-ink outline-none focus:border-ink"
            />
            <button type="submit" disabled={loading || !input.trim()} className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-ink text-onink disabled:opacity-40" aria-label="Gönder">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] font-medium text-t4">Yatırım tavsiyesi değildir.</p>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const user = role === 'user';
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-[14px] leading-[1.55] ${
          user
            ? 'rounded-[18px_18px_6px_18px] bg-ink font-medium text-onink'
            : 'rounded-[18px_18px_18px_6px] border border-hairline bg-panel font-medium text-ink'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
