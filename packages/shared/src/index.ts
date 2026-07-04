import type { ComponentType, ReactNode } from 'react';

export type Role = 'ADMIN' | 'EDITOR' | 'AUTHOR';
export type ContentType = 'POST' | 'PAGE';
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'TRASHED';
export type CommentStatus = 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt: string;
  _count?: { contents: number };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  _count?: { contents: number };
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  _count?: { contents: number };
}

export interface Content {
  id: string;
  type: ContentType;
  status: ContentStatus;
  title: string;
  slug: string;
  excerpt?: string | null;
  blocks: unknown[];
  seo: Record<string, unknown>;
  coverImage?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  authorId: string;
  author?: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  categories?: Category[];
  tags?: Tag[];
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number };
}

export interface Media {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  alt?: string | null;
  createdAt: string;
  uploader?: Pick<User, 'id' | 'name'>;
}

export interface Comment {
  id: string;
  contentId: string;
  body: string;
  status: CommentStatus;
  guestName?: string | null;
  author?: Pick<User, 'id' | 'name' | 'avatarUrl'> | null;
  content?: Pick<Content, 'id' | 'title' | 'slug'>;
  replies?: Comment[];
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ThemeLayoutProps {
  settings: SiteSettings;
  pages: Content[];
  children: ReactNode;
}

export interface ThemeHomeProps {
  settings: SiteSettings;
  posts: Paginated<Content>;
}

export interface ThemeSingleProps {
  settings: SiteSettings;
  content: Content;
  comments: Comment[];
}

export interface ThemeArchiveProps {
  settings: SiteSettings;
  title: string;
  posts: Paginated<Content>;
}

export interface ThemeDefinition {
  manifest: {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
  };
  Layout: ComponentType<ThemeLayoutProps>;
  Home: ComponentType<ThemeHomeProps>;
  Post: ComponentType<ThemeSingleProps>;
  Page: ComponentType<ThemeSingleProps>;
  Archive: ComponentType<ThemeArchiveProps>;
}

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  activeTheme: string;
  homepageType: 'latest-posts' | 'static-page';
  homepageId: string | null;
  postsPerPage: number;
  allowRegistration: boolean;
  [key: string]: unknown;
}
