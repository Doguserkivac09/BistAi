'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare, Heart, Pin, Plus, ChevronLeft, ChevronRight,
  TrendingUp, Filter,
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

function PostCard({ post }: { post: Post }) {
  const cat = CATEGORY_LABELS[post.category];
  return (
    <Link href={`/topluluk/${post.id}`}>
      <Card className="border-border hover:border-primary/30 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
              {post.author?.display_name?.[0]?.toUpperCase() ?? 'U'}
            </div>

            <div className="flex-1 min-w-0">
              {/* Header */}
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
                {post.is_pinned && <Pin className="h-3 w-3 text-yellow-400" />}
              </div>

              {/* Title */}
              <h3 className="mt-1 text-sm font-semibold text-text-primary line-clamp-1">
                {post.title}
              </h3>

              {/* Body preview */}
              <p className="mt-1 text-xs text-text-secondary line-clamp-2">
                {post.body}
              </p>

              {/* Footer: badges + stats */}
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cat.color}`}>
                  {cat.label}
                </span>
                {post.sembol && (
                  <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <TrendingUp className="h-2.5 w-2.5" />
                    {post.sembol}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <Heart className={cn('h-3 w-3', post.is_liked && 'fill-red-400 text-red-400')} />
                  {post.like_count}
                </span>
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <MessageSquare className="h-3 w-3" />
                  {post.comment_count}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
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

const CATEGORIES: { value: PostCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'analiz', label: 'Analiz' },
  { value: 'haber', label: 'Haber' },
  { value: 'soru', label: 'Soru' },
  { value: 'strateji', label: 'Strateji' },
  { value: 'genel', label: 'Genel' },
];

export default function ToplulukPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (sort !== 'newest') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    router.replace(`/topluluk${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [category, sort, page, router]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Topluluk</h1>
          <Button size="sm" asChild>
            <Link href="/topluluk/yeni">
              <Plus className="h-4 w-4 mr-1.5" />
              Yeni Paylaşım
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-4 w-4 text-text-secondary" />
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => { setCategory(c.value); setPage(1); }}
              aria-pressed={category === c.value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                category === c.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-secondary hover:border-primary/30'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setSort('newest'); setPage(1); }}
            aria-pressed={sort === 'newest'}
            className={cn(
              'text-xs font-medium transition-colors',
              sort === 'newest' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            En Yeni
          </button>
          <span className="text-text-secondary/30">|</span>
          <button
            type="button"
            onClick={() => { setSort('popular'); setPage(1); }}
            aria-pressed={sort === 'popular'}
            className={cn(
              'text-xs font-medium transition-colors',
              sort === 'popular' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            Popüler
          </button>
        </div>

        {/* Posts */}
        {loading ? (
          <FeedSkeleton />
        ) : !data || data.posts.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center">
              <MessageSquare className="h-10 w-10 text-text-secondary/30 mx-auto mb-3" />
              <p className="text-text-secondary text-sm">Henüz paylaşım yok.</p>
              <Button size="sm" className="mt-3" asChild>
                <Link href="/topluluk/yeni">İlk paylaşımı sen yap!</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}

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
