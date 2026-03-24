'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare, Heart, Pin, Plus, ChevronLeft, ChevronRight,
  TrendingUp, Filter, Users, Search, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Post, PostsResponse, PostCategory } from '@/types/community';
import { CATEGORY_LABELS } from '@/types/community';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins}dk`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}sa`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}g`;
  return `${Math.floor(days / 30)}ay`;
}

const AVATAR_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
];

function getAvatarGradient(name: string): string {
  const idx = (name.charCodeAt(0) ?? 0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] ?? 'from-violet-500 to-indigo-600';
}

const CATEGORY_COLORS: Record<string, string> = {
  analiz:   'border-blue-500/30 bg-blue-500/10 text-blue-400',
  strateji: 'border-green-500/30 bg-green-500/10 text-green-400',
  soru:     'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  haber:    'border-purple-500/30 bg-purple-500/10 text-purple-400',
  genel:    'border-white/15 bg-white/5 text-white/50',
};

function PostCard({
  post,
  index,
  onSembolFilter,
}: {
  post: Post;
  index: number;
  onSembolFilter?: (sembol: string) => void;
}) {
  const cat = CATEGORY_LABELS[post.category];
  const authorName = post.author?.display_name ?? 'U';
  const gradient = getAvatarGradient(authorName);
  const categoryColor = CATEGORY_COLORS[post.category] ?? cat.color;
  const readMinutes = Math.max(1, Math.round(post.body.split(' ').length / 200));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
    >
      <Link href={`/topluluk/${post.id}`}>
        <Card
          className={cn(
            'border-border hover:border-primary/30 transition-all duration-200 cursor-pointer',
            post.is_pinned && 'border-l-[3px] border-l-yellow-500/70 bg-yellow-500/[0.03]'
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm',
                  gradient
                )}
              >
                {authorName[0]?.toUpperCase() ?? 'U'}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {post.author?.display_name ?? 'Anonim'}
                  </span>
                  {post.author?.tier && post.author.tier !== 'free' && (
                    <span className="text-[10px] font-semibold rounded-full border px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border-blue-500/30">
                      {post.author.tier.toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs text-text-secondary">{timeAgo(post.created_at)}</span>
                  {post.is_pinned && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                      <Pin className="h-2.5 w-2.5" />
                      Öne Çıkan
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="mt-1.5 text-base font-bold text-text-primary line-clamp-1">
                  {post.title}
                </h3>

                {/* Body preview */}
                <p className="mt-1 text-sm text-text-secondary line-clamp-2 leading-relaxed">
                  {post.body}
                </p>

                {/* Footer */}
                <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                      categoryColor
                    )}
                  >
                    {cat.label}
                  </span>
                  {post.sembol && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        onSembolFilter?.(post.sembol!);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                    >
                      <TrendingUp className="h-3 w-3" />
                      {post.sembol}
                    </button>
                  )}
                  <span className="text-xs text-text-secondary">{readMinutes} dk</span>
                  <span className="flex items-center gap-1 text-xs text-text-secondary ml-auto">
                    <Heart
                      className={cn(
                        'h-3.5 w-3.5',
                        post.is_liked && 'fill-red-400 text-red-400'
                      )}
                    />
                    {post.like_count}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-text-secondary">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {post.comment_count}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="flex flex-1 items-center gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5"
    >
      <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-text-primary leading-none">{value.toLocaleString('tr-TR')}</p>
        <p className="text-[11px] text-text-secondary mt-0.5 truncate">{label}</p>
      </div>
    </motion.div>
  );
}

function TrendingSymbols({
  posts,
  onFilter,
}: {
  posts: Post[];
  onFilter: (sembol: string) => void;
}) {
  const counts = posts.reduce<Record<string, number>>((acc, p) => {
    if (p.sembol) acc[p.sembol] = (acc[p.sembol] ?? 0) + 1;
    return acc;
  }, {});
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) return null;

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-4">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Konuşulan Hisseler
      </h3>
      <div className="space-y-2">
        {sorted.map(([sym, count], i) => (
          <button
            key={sym}
            type="button"
            onClick={() => onFilter(sym)}
            className="flex items-center justify-between w-full text-sm hover:text-primary transition-colors group"
          >
            <span className="flex items-center gap-2">
              <span className="text-text-secondary text-xs w-4">#{i + 1}</span>
              <span className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                {sym}
              </span>
            </span>
            <span className="text-xs text-text-secondary">{count} gönderi</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TopContributors({ posts }: { posts: Post[] }) {
  const counts = posts.reduce<Record<string, { name: string; count: number }>>((acc, p) => {
    if (p.author?.display_name) {
      const k = p.author.display_name;
      acc[k] = { name: k, count: (acc[k]?.count ?? 0) + 1 };
    }
    return acc;
  }, {});
  const top = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 3);
  if (!top.length) return null;

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-4">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Aktif Üyeler
      </h3>
      <div className="space-y-1">
        {top.map(({ name, count }) => (
          <div key={name} className="flex items-center justify-between py-1.5">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white bg-gradient-to-br',
                  getAvatarGradient(name)
                )}
              >
                {name[0]?.toUpperCase()}
              </div>
              <span className="text-xs text-text-primary">{name}</span>
            </div>
            <span className="text-[10px] text-text-secondary">{count} gönderi</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <div className="flex gap-3">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-10" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const CATEGORIES: { value: PostCategory | 'all'; label: string; color: string }[] = [
  { value: 'all',      label: 'Tümü',    color: 'border-primary bg-primary/10 text-primary' },
  { value: 'analiz',   label: 'Analiz',   color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'strateji', label: 'Strateji', color: 'border-green-500 bg-green-500/10 text-green-400' },
  { value: 'soru',     label: 'Soru',     color: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'haber',    label: 'Haber',    color: 'border-purple-500 bg-purple-500/10 text-purple-400' },
  { value: 'genel',    label: 'Genel',    color: 'border-white/20 bg-white/5 text-white/60' },
];

function ToplulukPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<PostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>(searchParams.get('category') ?? 'all');
  const [sort, setSort] = useState<string>(searchParams.get('sort') ?? 'newest');
  const [page, setPage] = useState(parseInt(searchParams.get('page') ?? '1', 10));
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [sembolFilter, setSembolFilter] = useState(searchParams.get('sembol') ?? '');

  // 350ms debounce for search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, sembolFilter]);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (category !== 'all') params.set('category', category);
      if (sort !== 'newest') params.set('sort', sort);
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (sembolFilter) params.set('sembol', sembolFilter);

      const res = await fetch(`/api/community/posts?${params}`);
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, category, sort, debouncedSearch, sembolFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort !== 'newest') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (sembolFilter) params.set('sembol', sembolFilter);
    const qs = params.toString();
    router.replace(`/topluluk${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [category, sort, page, debouncedSearch, sembolFilter, router]);

  // Stats — meta field yoksa mevcut sayfa toplamı kullan
  const metaData = data as (PostsResponse & { meta?: { total_likes?: number; total_comments?: number } }) | null;
  const totalPosts    = data?.total ?? 0;
  const totalLikes    = metaData?.meta?.total_likes    ?? data?.posts.reduce((s, p) => s + p.like_count, 0)    ?? 0;
  const totalComments = metaData?.meta?.total_comments ?? data?.posts.reduce((s, p) => s + p.comment_count, 0) ?? 0;

  // Active filter count badge
  const activeFilterCount = [
    category !== 'all',
    sort !== 'newest',
    !!debouncedSearch,
    !!sembolFilter,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setSembolFilter('');
    setCategory('all');
    setSort('newest');
    setPage(1);
  };

  const handleSembolFilter = (sym: string) => {
    setSembolFilter(sym);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-text-primary">Topluluk</h1>
          <Button size="sm" asChild className="shrink-0">
            <Link href="/topluluk/yeni">
              <Plus className="h-4 w-4 mr-1.5" />
              Yeni Paylaşım
            </Link>
          </Button>
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_260px] lg:gap-6">
          {/* ── Sol: Feed ── */}
          <div>
            {/* Stats Banner */}
            {data && (
              <div className="grid grid-cols-3 gap-2 mb-6">
                <StatCard icon={Users}          label="Toplam Gönderi" value={totalPosts}    delay={0} />
                <StatCard icon={Heart}          label="Toplam Beğeni"  value={totalLikes}    delay={0.08} />
                <StatCard icon={MessageSquare}  label="Toplam Yorum"   value={totalComments} delay={0.16} />
              </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Başlık veya içerikte ara..."
                className="w-full rounded-xl border border-border bg-white/[0.03] py-2.5 pl-9 pr-10 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-primary transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Filter className="h-4 w-4 text-text-secondary" />
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </div>

              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setCategory(c.value); setPage(1); }}
                  aria-pressed={category === c.value}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-150',
                    category === c.value
                      ? c.color
                      : 'border-border text-text-secondary hover:border-primary/30 hover:text-text-primary'
                  )}
                >
                  {c.label}
                </button>
              ))}

              {/* Active sembol chip */}
              {sembolFilter && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  <TrendingUp className="h-3 w-3" />
                  {sembolFilter}
                  <button
                    type="button"
                    onClick={() => setSembolFilter('')}
                    className="hover:text-white transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>

            {/* Sort chips */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {[
                { value: 'newest',   label: 'En Yeni' },
                { value: 'popular',  label: 'Popüler' },
                { value: 'trending', label: 'Trend' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => { setSort(s.value); setPage(1); }}
                  aria-pressed={sort === s.value}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-150',
                    sort === s.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/30 hover:text-text-primary'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Posts */}
            <AnimatePresence mode="wait">
              {loading ? (
                <FeedSkeleton />
              ) : !data || data.posts.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-border">
                    <CardContent className="py-16 text-center">
                      <div className="flex justify-center mb-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
                          <MessageSquare className="h-8 w-8 text-text-secondary/40" />
                        </div>
                      </div>
                      {debouncedSearch || sembolFilter ? (
                        <>
                          <h3 className="text-base font-semibold text-text-primary mb-2">Sonuç bulunamadı</h3>
                          <p className="text-sm text-text-secondary mb-5 max-w-xs mx-auto">
                            &ldquo;{debouncedSearch || sembolFilter}&rdquo; için herhangi bir gönderi bulunamadı.
                          </p>
                          <Button variant="outline" size="sm" onClick={clearFilters}>
                            Filtreyi Temizle
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3 className="text-base font-semibold text-text-primary mb-2">Henüz paylaşım yok</h3>
                          <p className="text-sm text-text-secondary mb-5 max-w-xs mx-auto">
                            Bu kategoride henüz içerik yok. İlk paylaşımınızı yaparak topluluğu başlatabilirsiniz.
                          </p>
                          <Button asChild>
                            <Link href="/topluluk/yeni">
                              <Plus className="h-4 w-4 mr-1.5" />
                              İlk Paylaşımı Sen Yap
                            </Link>
                          </Button>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key={`${category}-${sort}-${page}-${debouncedSearch}-${sembolFilter}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-3"
                >
                  {data.posts.map((post, i) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      index={i}
                      onSembolFilter={handleSembolFilter}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {data && data.total_pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-text-secondary">
                  {page} / {data.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {/* ── Sağ: Sidebar (sadece lg+) ── */}
          <aside className="hidden lg:flex flex-col gap-4">
            <TrendingSymbols posts={data?.posts ?? []} onFilter={handleSembolFilter} />
            <TopContributors posts={data?.posts ?? []} />
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function ToplulukPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background">
          <main className="container mx-auto max-w-5xl px-4 py-6">
            <div className="flex items-center justify-between mb-6">
              <div className="h-8 w-32 rounded-lg bg-white/5" />
              <div className="h-8 w-28 rounded-lg bg-white/5" />
            </div>
            <FeedSkeleton />
          </main>
        </div>
      }
    >
      <ToplulukPageInner />
    </Suspense>
  );
}
