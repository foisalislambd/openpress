import { Allow, IsArray, IsBoolean, IsIn, IsISO8601, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const TYPES = ['POST', 'PAGE'] as const;
const STATUSES = ['DRAFT', 'PENDING', 'PUBLISHED', 'SCHEDULED', 'TRASHED'] as const;
const VISIBILITY = ['PUBLIC', 'PRIVATE', 'PASSWORD'] as const;
const COMMENT_STATUS = ['open', 'closed'] as const;

export class CreateContentDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsIn(TYPES as unknown as string[])
  type?: (typeof TYPES)[number];

  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(VISIBILITY as unknown as string[])
  visibility?: (typeof VISIBILITY)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsBoolean()
  sticky?: boolean;

  @IsOptional()
  @IsIn(COMMENT_STATUS as unknown as string[])
  commentStatus?: (typeof COMMENT_STATUS)[number];

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @IsOptional()
  @IsObject()
  seo?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsArray()
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  termIds?: string[];

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;

  @IsOptional()
  @IsString()
  translationGroup?: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, unknown>;
}

export class UpdateContentDto extends CreateContentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare title: string;
}

export class QueryContentDto {
  @IsOptional()
  @IsIn(TYPES as unknown as string[])
  type?: string;

  @IsOptional()
  @IsIn(STATUSES as unknown as string[])
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  postType?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  perPage?: string;

  @IsOptional()
  @IsIn(VISIBILITY as unknown as string[])
  visibility?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsISO8601()
  after?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @IsIn(['date', 'title', 'modified', 'relevance'])
  orderBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: string;

  @IsOptional()
  @IsIn(['only', 'exclude'])
  sticky?: string;

  @IsOptional()
  @IsString()
  metaKey?: string;

  @IsOptional()
  @IsString()
  metaValue?: string;

  @IsOptional()
  @IsIn(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'not_like', 'in', 'not_in', 'between', 'exists', 'not_exists'])
  metaCompare?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'not_like' | 'in' | 'not_in' | 'between' | 'exists' | 'not_exists';

  /** JSON meta_query object or list. */
  @IsOptional()
  @IsString()
  metaQuery?: string;

  /** JSON tax_query object. */
  @IsOptional()
  @IsString()
  taxQuery?: string;
}

export class UnlockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class AutosaveDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsArray()
  blocks: unknown[];
}

export class MetaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  key: string;

  @Allow()
  value: unknown;
}
