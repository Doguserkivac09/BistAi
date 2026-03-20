'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Heart, MessageSquare, TrendingUp, Pin, Flag,
  Send, Trash2, CornerDownRight, Bot, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostDetail, Comment } from '@/types/community';
import { CATEGORY_LABELS, REPORT_REASONS } from '@/types/community';
import { useRealtimeComments } from '@/lib/use-realtime-comments';

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

function CommentItem({
  comment,
  onReply,
  depth = 0,
  allComments,
  userTier,
}: {
  comment: Comment;
  onReply: (parentId: string) => void;
  depth?: number;
  allComments: Comment[];
  userTier: 'free' | 'pro' | 'premium';
}) {
  const replies = allComments.filter((c) => c.parent_id === comment.id);
  const isPremiumLocked = comment.is_ai && userTier !== 'premium';

  return (
    <div className={cn('mt-3', depth > 0 && 'ml-6 border-l border-border/50 pl-3')}>
      <div className="flex items-start gap-2">
        {/* Avatar */}
        <div className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
          comment.is_ai
            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
            : 'bg-primary/10 text-primary'
        )}>
          {comment.is_ai
            ? <Bot className="h-3.5 w-3.5" />
            : (comment.author?.display_name?.[0]?.toUpperCase() ?? 'U')}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {comment.is_ai ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-400">
                AI Analist
                <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide">
                  BETA
                </span>
              </span>
            ) : (
              <span className="text-xs font-medium text-text-primary">
                {comment.author?.display_name ?? 'Anonim'}
              </span>
            )}
            <span className="text-[10px] text-text-secondary">{timeAgo(comment.created_at)}</span>
          </div>

          {/* Premium gate için blur + CTA */}
          {isPremiumLocked ? (
            <div className="relative mt-1 rounded-lg overflow-hidden">
              <p className="text-sm text-text-secondary whitespace-pre-wrap select-none blur-sm">
                {comment.body}
              </p>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/70 backdrop-blur-[3px] rounded-lg">
                <Lock className="h-4 w-4 text-violet-400" />
                <span className="text-xs font-semibold text-violet-300">Premium İçerik</span>
                <Link
                  href="/fiyatlandirma"
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Premium&apos;a Yükselt →
                </Link>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-text-secondary whitespace-pre-wrap">{comment.body}</p>
          )}

          {/* AI yorumlarına yanıt yapılamaz */}
          {depth < 2 && !comment.is_ai && (
            <button
              onClick={() => onReply(comment.id)}
              className="mt-1 flex items-center gap-1 text-[10px] text-text-secondary hover:text-primary transition-colors"
            >
              <CornerDownRight className="h-2.5 w-2.5" />
              Yanıtla
            </button>
          )}
        </div>
      </div>
      {replies.map((r) => (
        <CommentItem key={r.id} comment={r} onReply={onReply} depth={depth + 1} allComments={allComments} userTier={userTier} />
      ))}
    </div>
  );
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Like state
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);

  // Comment state
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // User tier (premium gate için)
  const [userTier, setUserTier] = useState<'free' | 'pro' | 'premium'>('free');

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Post yüklenemedi');
      setPost(data);
      setLiked(data.is_liked);
      setLikeCount(data.like_count);
      setUserTier(data.user_tier ?? 'free');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Post yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  // Realtime: yeni yorum gelince otomatik yenile
  useRealtimeComments(id ?? null, fetchPost);

  // Like toggle
  const handleLike = async () => {
    if (liking) return;
    setLiking(true);

    // Optimistic update
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => wasLiked ? c - 1 : c + 1);

    try {
      const res = await fetch(`/api/community/posts/${id}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        // Rollback
        setLiked(wasLiked);
        setLikeCount((c) => wasLiked ? c + 1 : c - 1);
      }
    } catch {
      setLiked(wasLiked);
      setLikeCount((c) => wasLiked ? c + 1 : c - 1);
    } finally {
      setLiking(false);
    }
  };

  // Comment submit
  const handleComment = async () => {
    if (commenting || !commentBody.trim()) return;
    setCommenting(true);
    try {
      const res = await fetch(`/api/community/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: commentBody.trim(),
          parent_id: replyTo,
        }),
      });
      if (res.ok) {
        setCommentBody('');
        setReplyTo(null);
        fetchPost(); // Refresh to get new comment
      }
    } catch {
      // ignore
    } finally {
      setCommenting(false);
    }
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
    commentRef.current?.focus();
  };

  // Report
  const handleReport = async () => {
    if (reporting || !reportReason) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/community/posts/${id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reportReason,
          detail: reportDetail.trim() || null,
        }),
      });
      if (res.ok) {
        setReportSuccess(true);
        setTimeout(() => {
          setShowReport(false);
          setReportSuccess(false);
          setReportReason('');
          setReportDetail('');
        }, 2000);
      }
    } catch {
      // ignore
    } finally {
      setReporting(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!confirm('Bu paylaşımı silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/community/posts/${id}`, { method: 'DELETE' });
      if (res.ok) router.push('/topluluk');
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container mx-auto max-w-3xl px-4 py-6">
          <Skeleton className="h-6 w-24 mb-6" />
          <Skeleton className="h-8 w-3/4 mb-3" />
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-40 rounded-lg mb-6" />
          <Skeleton className="h-20 rounded-lg" />
        </main>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="border-red-500/30 bg-red-500/5 max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-400 font-medium">{error ?? 'Post bulunamadı.'}</p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/topluluk">Topluluk&apos;a Dön</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cat = CATEGORY_LABELS[post.category];
  const topLevelComments = post.comments.filter((c) => !c.parent_id);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-6">
        {/* Back */}
        <Link
          href="/topluluk"
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Topluluk
        </Link>

        {/* Post */}
        <Card className="border-border mb-6">
          <CardContent className="p-5">
            {/* Author */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                {post.author?.display_name?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div>
                <span className="text-sm font-medium text-text-primary">
                  {post.author?.display_name ?? 'Anonim'}
                </span>
                {post.author?.tier && post.author.tier !== 'free' && (
                  <span className="ml-1.5 text-[10px] font-semibold rounded-full border px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border-blue-500/30">
                    {post.author.tier.toUpperCase()}
                  </span>
                )}
                <p className="text-[10px] text-text-secondary">{timeAgo(post.created_at)}</p>
              </div>
              {post.is_pinned && <Pin className="h-3.5 w-3.5 text-yellow-400 ml-auto" />}
            </div>

            {/* Title + badges */}
            <h1 className="text-lg font-bold text-text-primary mb-2">{post.title}</h1>
            <div className="flex items-center gap-2 mb-4">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cat.color}`}>
                {cat.label}
              </span>
              {post.sembol && (
                <Link
                  href={`/hisse/${post.sembol}`}
                  className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  {post.sembol}
                </Link>
              )}
            </div>

            {/* Body */}
            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
              {post.body}
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-border flex items-center gap-4">
              <button
                onClick={handleLike}
                disabled={liking}
                className={cn(
                  'flex items-center gap-1.5 text-sm transition-colors',
                  liked ? 'text-red-400' : 'text-text-secondary hover:text-red-400'
                )}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                {likeCount}
              </button>
              <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                <MessageSquare className="h-4 w-4" />
                {post.comment_count}
              </span>
              <button
                onClick={() => setShowReport(!showReport)}
                className="ml-auto flex items-center gap-1 text-xs text-text-secondary hover:text-red-400 transition-colors"
              >
                <Flag className="h-3.5 w-3.5" />
                Şikayet
              </button>
              {post.author_id === post.author?.id && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Sil
                </button>
              )}
            </div>

            {/* Report form */}
            {showReport && (
              <div className="mt-3 p-3 rounded-lg border border-border bg-surface">
                {reportSuccess ? (
                  <p className="text-sm text-green-400">Şikayetiniz alındı. Teşekkürler.</p>
                ) : (
                  <>
                    <p className="text-xs font-medium text-text-primary mb-2">Şikayet Nedeni</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {REPORT_REASONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setReportReason(r.value)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs transition-colors',
                            reportReason === r.value
                              ? 'border-red-400 bg-red-500/10 text-red-400'
                              : 'border-border text-text-secondary hover:border-red-400/30'
                          )}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reportDetail}
                      onChange={(e) => setReportDetail(e.target.value)}
                      placeholder="Ek detay (opsiyonel)..."
                      maxLength={500}
                      rows={2}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none resize-none mb-2"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReport}
                      disabled={!reportReason || reporting}
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                    >
                      {reporting ? 'Gönderiliyor...' : 'Gönder'}
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comment input */}
        <Card className="border-border mb-4">
          <CardContent className="p-4">
            {replyTo && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-text-secondary">Yanıt yazıyorsun</span>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-xs text-primary hover:underline"
                >
                  İptal
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                ref={commentRef}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Yorumunu yaz..."
                maxLength={2000}
                rows={2}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary placeholder-text-secondary/50 focus:border-primary focus:outline-none resize-none"
              />
              <Button
                size="sm"
                onClick={handleComment}
                disabled={commenting || !commentBody.trim()}
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Comments */}
        {topLevelComments.length > 0 ? (
          <div className="space-y-1">
            {topLevelComments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={handleReply}
                allComments={post.comments}
                userTier={userTier}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-text-secondary py-6">
            Henüz yorum yok. İlk yorumu sen yap!
          </p>
        )}
      </main>
    </div>
  );
}
