'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
  const authorName = comment.author?.display_name ?? 'U';
  const gradient = getAvatarGradient(authorName);

  if (comment.is_ai) {
    return (
      <div className={cn('mt-3', depth > 0 && 'ml-8 border-l-2 border-white/8 pl-4')}>
        <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/8 to-transparent p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 border border-violet-500/40">
              <Bot className="h-4 w-4 text-violet-400" />
            </div>
            <span className="text-sm font-semibold text-violet-300">AI Analist</span>
            <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-violet-400">
              BETA
            </span>
            <span className="ml-auto text-xs text-white/30">{timeAgo(comment.created_at)}</span>
          </div>

          {isPremiumLocked ? (
            <div className="relative rounded-lg overflow-hidden">
              <p className="text-sm text-white/50 whitespace-pre-wrap select-none blur-sm leading-relaxed">
                {comment.body}
              </p>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-[3px] rounded-lg">
                <Lock className="h-5 w-5 text-violet-400" />
                <span className="text-sm font-semibold text-violet-300">Premium İçerik</span>
                <Link
                  href="/fiyatlandirma"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Premium&apos;a Yükselt →
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{comment.body}</p>
          )}
        </div>
        {replies.map((r) => (
          <CommentItem key={r.id} comment={r} onReply={onReply} depth={depth + 1} allComments={allComments} userTier={userTier} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('mt-3', depth > 0 && 'ml-8 border-l-2 border-white/8 pl-4')}>
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white',
            gradient
          )}
        >
          {authorName[0]?.toUpperCase() ?? 'U'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white/90">
              {comment.author?.display_name ?? 'Anonim'}
            </span>
            {comment.author?.tier && comment.author.tier !== 'free' && (
              <span className="text-[10px] font-bold rounded-full border px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border-blue-500/30">
                {comment.author.tier.toUpperCase()}
              </span>
            )}
            <span className="text-xs text-white/30">{timeAgo(comment.created_at)}</span>
          </div>

          <p className="mt-1 text-sm text-white/65 whitespace-pre-wrap leading-relaxed">{comment.body}</p>

          {depth < 2 && (
            <button
              onClick={() => onReply(comment.id)}
              className="mt-1.5 flex items-center gap-1 text-xs text-white/30 hover:text-primary transition-colors"
            >
              <CornerDownRight className="h-3 w-3" />
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
  const [likeAnim, setLikeAnim] = useState(false);

  // Comment state
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commenting, setCommenting] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // User tier
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

  useRealtimeComments(id ?? null, fetchPost);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((c) => wasLiked ? c - 1 : c + 1);
    if (!wasLiked) {
      setLikeAnim(true);
      setTimeout(() => setLikeAnim(false), 400);
    }
    try {
      const res = await fetch(`/api/community/posts/${id}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
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

  const handleComment = async () => {
    if (commenting || !commentBody.trim()) return;
    setCommenting(true);
    try {
      const res = await fetch(`/api/community/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim(), parent_id: replyTo }),
      });
      if (res.ok) {
        setCommentBody('');
        setReplyTo(null);
        fetchPost();
      }
    } catch {
      // ignore
    } finally {
      setCommenting(false);
    }
  };

  const handleReply = (parentId: string) => {
    setReplyTo(parentId);
    setTimeout(() => commentRef.current?.focus(), 50);
  };

  const handleReport = async () => {
    if (reporting || !reportReason) return;
    setReporting(true);
    try {
      const res = await fetch(`/api/community/posts/${id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reportReason, detail: reportDetail.trim() || null }),
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
          <Skeleton className="h-5 w-24 mb-6" />
          <Skeleton className="h-8 w-3/4 mb-3" />
          <Skeleton className="h-4 w-32 mb-4" />
          <Skeleton className="h-40 rounded-xl mb-6" />
          <Skeleton className="h-24 rounded-xl" />
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
  const authorName = post.author?.display_name ?? 'U';
  const authorGradient = getAvatarGradient(authorName);
  const topLevelComments = post.comments.filter((c) => !c.parent_id);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-6">
        {/* Back */}
        <Link
          href="/topluluk"
          className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-primary transition-colors mb-5"
        >
          <ArrowLeft className="h-4 w-4" />
          Topluluk
        </Link>

        {/* Post */}
        <Card className="border-white/8 mb-5">
          <CardContent className="p-6">
            {/* Author row */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={cn(
                  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-sm',
                  authorGradient
                )}
              >
                {authorName[0]?.toUpperCase() ?? 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white/90">
                    {post.author?.display_name ?? 'Anonim'}
                  </span>
                  {post.author?.tier && post.author.tier !== 'free' && (
                    <span className="text-[10px] font-bold rounded-full border px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border-blue-500/30">
                      {post.author.tier.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/35">{timeAgo(post.created_at)}</p>
              </div>
              {post.is_pinned && (
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs font-semibold text-yellow-400">
                  <Pin className="h-3 w-3" />
                  Öne Çıkan
                </span>
              )}
            </div>

            {/* Title + badges */}
            <h1 className="text-xl font-bold text-white mb-3">{post.title}</h1>
            <div className="flex items-center gap-2 mb-5">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cat.color}`}>
                {cat.label}
              </span>
              {post.sembol && (
                <Link
                  href={`/hisse/${post.sembol}`}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors"
                >
                  <TrendingUp className="h-3 w-3" />
                  {post.sembol}
                </Link>
              )}
            </div>

            {/* Body */}
            <div className="text-base text-white/70 whitespace-pre-wrap leading-relaxed">
              {post.body}
            </div>

            {/* Actions */}
            <div className="mt-5 pt-4 border-t border-white/6 flex items-center gap-5">
              <motion.button
                onClick={handleLike}
                disabled={liking}
                whileTap={{ scale: 0.85 }}
                animate={likeAnim ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={cn(
                  'flex items-center gap-1.5 text-base font-medium transition-colors',
                  liked ? 'text-red-400' : 'text-white/40 hover:text-red-400'
                )}
              >
                <Heart className={cn('h-5 w-5', liked && 'fill-current')} />
                {likeCount}
              </motion.button>
              <span className="flex items-center gap-1.5 text-base text-white/40">
                <MessageSquare className="h-5 w-5" />
                {post.comment_count}
              </span>
              <button
                onClick={() => setShowReport(!showReport)}
                className="ml-auto flex items-center gap-1 text-sm text-white/30 hover:text-red-400 transition-colors"
              >
                <Flag className="h-3.5 w-3.5" />
                Şikayet
              </button>
              {post.author_id === post.author?.id && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 text-sm text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Sil
                </button>
              )}
            </div>

            {/* Report form */}
            <AnimatePresence>
              {showReport && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 p-4 rounded-xl border border-white/8 bg-white/3 overflow-hidden"
                >
                  {reportSuccess ? (
                    <p className="text-sm text-green-400">Şikayetiniz alındı. Teşekkürler.</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-white/70 mb-3">Şikayet Nedeni</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {REPORT_REASONS.map((r) => (
                          <button
                            key={r.value}
                            onClick={() => setReportReason(r.value)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs transition-colors',
                              reportReason === r.value
                                ? 'border-red-400 bg-red-500/10 text-red-400'
                                : 'border-white/10 text-white/40 hover:border-red-400/30'
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
                        className="w-full rounded-lg border border-white/8 bg-background px-3 py-2 text-sm text-white/70 placeholder-white/20 focus:border-primary focus:outline-none resize-none mb-3"
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
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* Comment input */}
        <div className="rounded-2xl border border-white/8 bg-[#0a0a18] p-4 mb-6">
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 mb-3 overflow-hidden"
              >
                <CornerDownRight className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm text-white/50">Yanıt yazıyorsun</span>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-sm text-primary hover:underline"
                >
                  İptal
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <textarea
            ref={commentRef}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Yorumunu paylaş..."
            maxLength={2000}
            rows={3}
            className="w-full bg-transparent border-0 outline-none text-base text-white/80 placeholder-white/20 resize-none mb-3 leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <span className={cn(
              'text-xs font-mono tabular-nums transition-colors',
              commentBody.length > 1800 ? 'text-red-400' : commentBody.length > 1500 ? 'text-yellow-400' : 'text-white/25'
            )}>
              {commentBody.length}/2000
            </span>
            <Button
              size="sm"
              onClick={handleComment}
              disabled={commenting || !commentBody.trim()}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {commenting ? 'Gönderiliyor...' : 'Gönder'}
            </Button>
          </div>
        </div>

        {/* Comments section */}
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-white">{post.comment_count} Yorum</h3>
        </div>

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
          <div className="text-center py-10">
            <MessageSquare className="h-10 w-10 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/35">Henüz yorum yok. İlk yorumu sen yap!</p>
          </div>
        )}
      </main>
    </div>
  );
}
