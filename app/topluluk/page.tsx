'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare, Heart, Pin, Plus, ChevronLeft, ChevronRight,
  TrendingUp, Filter, Users,
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
  const idx = (name.charCodeAt(0) ?? 0) % 5;
  return AVATAR_GRADIENTS[idx];
}

const CATEGORY_COLORS: Record<string, string> = {
  analiz: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  strateji: 'border-green-500/30 bg-green-500/10 text-green-400',
  soru: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  haber: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  genel: 'border-white/15 bg-white/5 text-white/50',
};

function PostCard({ post, index }: { post: Post; index: number }) {
  const cat = CATEGORY_LABELS[post.category];
  const authorName = post.author?.display_name ?? 'U';
  const gradient = getAvatarGradient(authorName);
  const categoryColor = CATEGORY_COLORS[post.category] ?? cat.color;

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
                      One Cikan
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary cursor-pointer hover:bg-primary/15 transition-colors">
                      <TrendingUp className="h-3 w-3" />
                      {post.sembol}
                    </span>
                  )}
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
      className="flex flex-1 items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-lg font-bold text-text-primary leading-none">{value.toLocaleString('tr-TR')}</p>
        <p className="text-xs text-text-secondary mt-0.5">{label}</p>
      </div>
    </motion.div>
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
  { value: 'all',      label: 'Tumü',    color: 'border-primary bg-primary/10 text-primary' },
  { value: 'analiz',   label: 'Analiz',   color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'strateji', label: 'Strateji', color: 'border-green-500 bg-green-500/10 text-green-400' },
  { value: 'soru',     label: 'Soru',     color: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'haber',    label: 'Haber',    color: 'border-purple-500 bg-purple-500/10 text-purple-400' },
  { value: 'genel',    label: 'Genel',    color: 'border-white/20 bg-white/5 text-white/60' },
];

export default function ToplulukPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const _ref = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<PostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>(searchParams.get('category') ?? 'all');
  const [sort, setSort] = useState<string>(searchParams.get('sort') ?? 'newest');
  const [page, setPage] = useState(parseInt(searchParams.get('page') ?? '1', 10));

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (category !== 'all') params.set('category', category);
      if (sort !== 'newest') params.set('sort', sort);

      const res = await fetch(`/api/community/posts?${params}`);
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, category, sort]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort !== 'newest') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    router.replace(`/topluluk${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [category, sort, page, router]);

  const totalLikes = data?.posts.reduce((sum, p) => sum + p.like_count, 0) ?? 0;
  const totalComments = data?.posts.reduce((sum, p) => sum + p.comment_count, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background" ref={_ref}>
      <main className="container mx-auto max-w-3xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Topluluk</h1>
          <Button size="sm" asChild>
            <Link href="/topluluk/yeni">
              <Plus className="h-4 w-4 mr-1.5" />
              Yeni Paylasim
            </Link>
          </Button>
        </div>

        {/* Stats Banner */}
        {data && (
          <div className="flex gap-3 mb-6">
            <StatCard icon={Users} label="Toplam Gonderi" value={data.total} delay={0} />
            <StatCard icon={Heart} label="Toplam Begeni" value={totalLikes} delay={0.08} />
            <StatCard icon={MessageSquare} label="Toplam Yorum" value={totalComments} delay={0.16} />
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Filter className="h-4 w-4 text-text-secondary flex-shrink-0" />
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => { setCategory(c.value); setPage(1); }}
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
        </div>

        {/* Sort chips */}
        <div className="flex items-center gap-2 mb-5">
          {[
            { value: 'newest',  label: 'En Yeni' },
            { value: 'popular', label: 'Populer' },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => { setSort(s.value); setPage(1); }}
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
                  <h3 className="text-base font-semibold text-text-primary mb-2">Henüz paylasim yok</h3>
                  <p className="text-sm text-text-secondary mb-5 max-w-xs mx-auto">
                    Bu kategoride henüz icerik yok. Ilk paylasiminizi yaparak toplulugu baslatabilirsiniz.
                  </p>
                  <Button asChild>
                    <Link href="/topluluk/yeni">
                      <Plus className="h-4 w-4 mr-1.5" />
                      Ilk Paylasimu Sen Yap
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={`${category}-${sort}-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {data.posts.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} />
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
      </main>
    </div>
  );
}
