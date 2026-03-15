export interface PostAuthor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  tier: 'free' | 'pro' | 'premium';
}

export interface Post {
  id: string;
  author_id: string;
  title: string;
  body: string;
  sembol: string | null;
  category: 'genel' | 'analiz' | 'haber' | 'soru' | 'strateji';
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_deleted: boolean;
  is_liked: boolean;
  created_at: string;
  updated_at: string;
  author: PostAuthor;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  author: PostAuthor;
}

export interface PostDetail extends Post {
  comments: Comment[];
}

export interface PostsResponse {
  posts: Post[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export type PostCategory = Post['category'];

export const CATEGORY_LABELS: Record<PostCategory, { label: string; color: string }> = {
  genel: { label: 'Genel', color: 'bg-gray-500/10 text-gray-400 border-gray-500/30' },
  analiz: { label: 'Analiz', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  haber: { label: 'Haber', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  soru: { label: 'Soru', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  strateji: { label: 'Strateji', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
};

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'hakaret', label: 'Hakaret / Küfür' },
  { value: 'yaniltici', label: 'Yanıltıcı Bilgi' },
  { value: 'diger', label: 'Diğer' },
] as const;
