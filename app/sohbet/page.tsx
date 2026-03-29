'use client';

/**
 * AI Sohbet — BistAI Yatırım Asistanı
 *
 * claude-opus-4-6 modeli ile streaming chat.
 * Kullanıcının portföy bağlamı + makro durum otomatik eklenir.
 *
 * Step 5 — Opus (streaming API + context builder + chat UI)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot, Send, User, Sparkles, RefreshCw, AlertCircle,
  TrendingUp, ChevronRight, Lock,
} from 'lucide-react';
import type { ChatMessage, ChatContext } from '@/app/api/chat/route';

// ── Öneri soruları ────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Portföyümde risk dağılımı nasıl görünüyor?',
  'Bu hafta BIST\'te dikkat edilmesi gereken sektörler hangileri?',
  'RSI uyumsuzluğu ne anlama gelir, ne zaman önemlidir?',
  'Altın çapraz sinyali gördüm, nasıl değerlendireyim?',
  'USD/TRY yükselişi hangi hisseleri etkiler?',
  'Portföy çeşitlendirmesi için hangi sektörlere bakmalıyım?',
];

// ── Mesaj Balonu ──────────────────────────────────────────────────────

function MessageBubble({ msg, isStreaming }: { msg: ChatMessage; isStreaming?: boolean }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full mt-0.5 ${
        isUser ? 'bg-primary/20' : 'bg-violet-500/20'
      }`}>
        {isUser
          ? <User className="h-3.5 w-3.5 text-primary" />
          : <Bot className="h-3.5 w-3.5 text-violet-400" />
        }
      </div>

      {/* Balon */}
      <div className={`max-w-[80%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary text-white rounded-tr-sm'
          : 'bg-surface border border-border text-text-primary rounded-tl-sm'
      }`}>
        {isUser ? (
          <>
            {msg.content}
          </>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em:     ({ children }) => <em className="italic">{children}</em>,
              h1:     ({ children }) => <p className="font-bold mt-2 mb-1">{children}</p>,
              h2:     ({ children }) => <p className="font-semibold mt-2 mb-1">{children}</p>,
              h3:     ({ children }) => <p className="font-semibold mt-1 mb-0.5">{children}</p>,
              ul:     ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
              ol:     ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
              li:     ({ children }) => <li>{children}</li>,
              code:   ({ children }) => <code className="bg-black/15 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
              pre:    ({ children }) => <pre className="bg-black/15 rounded p-2 my-1 text-xs font-mono overflow-x-auto">{children}</pre>,
              table:  ({ children }) => <div className="overflow-x-auto my-1"><table className="text-xs border-collapse w-full">{children}</table></div>,
              th:     ({ children }) => <th className="border border-border/50 px-2 py-1 text-left font-semibold bg-black/10">{children}</th>,
              td:     ({ children }) => <td className="border border-border/50 px-2 py-1">{children}</td>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 my-1 opacity-80">{children}</blockquote>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
        {isStreaming && (
          <span className="ml-1 inline-block h-3.5 w-0.5 animate-pulse bg-current opacity-70 align-middle" />
        )}
      </div>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────

export default function SohbetPage() {
  const searchParams = useSearchParams();
  const sembol = searchParams.get('sembol') ?? undefined;

  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError]         = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [loggedIn, setLoggedIn]   = useState<boolean | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  // Auth kontrolü
  useEffect(() => {
    import('@/lib/supabase').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data: { user } }) => {
        setLoggedIn(!!user);
      });
    });
  }, []);

  // Scroll to bottom — container'ı kaydır, window'u değil
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText]);

  // Sembol bağlamı varsa karşılama mesajı
  useEffect(() => {
    if (sembol && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: `Merhaba! **${sembol}** hakkında sorularınıza yardımcı olabilirim. Ne öğrenmek istersiniz?`,
      }]);
    } else if (!sembol && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Merhaba! Ben BistAI\'nin yatırım asistanıyım. Portföyünüz, BIST hisseleri, teknik analiz veya makroekonomik gelişmeler hakkında sorularınızı yanıtlayabilirim.',
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sembol]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput('');

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
    ];
    setMessages(newMessages);
    setLoading(true);
    setStreamText('');

    const context: ChatContext = { sembol };

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.limitReached) {
          setLimitReached(true);
          setDailyLimit(dailyLimit);
        }
        setError(data.error ?? 'Bir hata oluştu.');
        setLoading(false);
        return;
      }

      // SSE stream oku
      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream alınamadı.');

      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) {
              setError(parsed.error);
              break;
            }
            if (parsed.text) {
              accumulated += parsed.text;
              setStreamText(accumulated);
            }
            if (parsed.done) {
              setRemaining(parsed.remaining ?? null);
              setDailyLimit(parsed.dailyLimit ?? null);
            }
          } catch { /* json parse hatası */ }
        }
      }

      // Stream bitti — mesajı listeye ekle
      if (accumulated) {
        setMessages(prev => [...prev, { role: 'assistant', content: accumulated }]);
      }
      setStreamText('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Bağlantı hatası. Lütfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [messages, loading, sembol, dailyLimit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Giriş yapılmamış
  if (loggedIn === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-border bg-surface p-8 text-center">
          <Bot className="h-10 w-10 text-violet-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-text-primary mb-2">AI Yatırım Asistanı</h2>
          <p className="text-sm text-text-secondary mb-6">
            AI asistanı kullanmak için giriş yapmanız gerekiyor.
          </p>
          <Link
            href="/giris"
            className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-text-primary">BistAI Asistan</span>
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              {sembol && (
                <p className="text-[11px] text-text-muted">{sembol} bağlamında</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {remaining !== null && dailyLimit !== null && (
              <span className="text-[11px] text-text-muted">
                {remaining}/{dailyLimit} mesaj kaldı
              </span>
            )}
            <button
              onClick={() => {
                setMessages([]);
                setError(null);
                setLimitReached(false);
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-primary/30 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Yeni Sohbet
            </button>
          </div>
        </div>
      </div>

      {/* Mesajlar */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-3xl px-4 py-6 space-y-4">

          {/* Öneri soruları — sadece ilk karşılama mesajında */}
          {messages.length <= 1 && !loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5 text-left text-xs text-text-secondary hover:border-primary/30 hover:text-text-primary transition-colors"
                >
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                  {s}
                  <ChevronRight className="h-3 w-3 shrink-0 ml-auto opacity-40" />
                </button>
              ))}
            </div>
          )}

          {/* Mesaj listesi */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {/* Streaming mesaj */}
          {loading && streamText && (
            <MessageBubble
              msg={{ role: 'assistant', content: streamText }}
              isStreaming
            />
          )}

          {/* Yazıyor indikatörü */}
          {loading && !streamText && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/20 mt-0.5 shrink-0">
                <Bot className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Hata */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Limit doldu */}
          {limitReached && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center">
              <Lock className="h-8 w-8 text-amber-400" />
              <div>
                <p className="text-sm font-medium text-amber-300">Günlük limit doldu</p>
                <p className="text-xs text-text-secondary mt-1">
                  Daha fazla mesaj için Pro plana geçin.
                </p>
              </div>
              <Link
                href="/fiyatlandirma"
                className="rounded-lg bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/30 transition-colors"
              >
                Pro Plana Geç
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* Input alanı */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-3xl px-4 py-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={limitReached ? 'Günlük limit doldu…' : 'BIST hisseleri veya portföyünüz hakkında sorun…'}
                disabled={loading || limitReached}
                rows={1}
                className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 pr-12 text-sm text-text-primary placeholder-text-muted/50 focus:border-primary focus:outline-none disabled:opacity-50 min-h-[44px] max-h-[120px]"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || loading || limitReached}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />
              }
            </button>
          </form>
          <p className="mt-2 text-center text-[10px] text-text-muted">
            <Sparkles className="inline h-2.5 w-2.5 mr-0.5" />
            claude-opus-4-6 · Bu yanıtlar yatırım tavsiyesi değildir. Enter ile gönder, Shift+Enter ile satır ekle.
          </p>
        </div>
      </div>
    </div>
  );
}
