export interface MediaQueryInput {
  page?: number | string;
  perPage?: number | string;
  search?: string;
  month?: string;
  mime?: string;
  authorId?: string;
  siteId: string;
}

export interface BuiltMediaQuery {
  where: string;
  params: unknown[];
  page: number;
  perPage: number;
  offset: number;
}

const GROUPS: Record<string, string> = {
  image: `m."mimeType" LIKE 'image/%'`,
  audio: `m."mimeType" LIKE 'audio/%'`,
  video: `m."mimeType" LIKE 'video/%'`,
  document: `(m."mimeType" LIKE 'application/%' OR m."mimeType" LIKE 'text/%')`,
  other: `m."mimeType" NOT LIKE 'image/%' AND m."mimeType" NOT LIKE 'audio/%' AND m."mimeType" NOT LIKE 'video/%' AND m."mimeType" NOT LIKE 'application/%' AND m."mimeType" NOT LIKE 'text/%'`,
};

/** List filters for the media library. There is no 60-row ceiling; callers page with LIMIT/OFFSET. */
export function buildMediaQuery(input: MediaQueryInput): BuiltMediaQuery {
  const params: unknown[] = [input.siteId];
  const clauses = [`m."siteId" = $1`];
  const search = input.search?.trim();
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    clauses.push(
      `(m.filename ILIKE $${params.length} ESCAPE '\\' OR coalesce(m.alt, '') ILIKE $${params.length} ESCAPE '\\' OR coalesce(m.caption, '') ILIKE $${params.length} ESCAPE '\\')`,
    );
  }
  if (input.month && /^\d{6}$/.test(input.month)) {
    params.push(input.month);
    clauses.push(`to_char(date_trunc('month', m."createdAt"), 'YYYYMM') = $${params.length}`);
  }
  const mime = input.mime?.trim().toLowerCase();
  if (mime && GROUPS[mime]) {
    clauses.push(GROUPS[mime]);
  } else if (mime && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) {
    params.push(mime);
    clauses.push(`lower(m."mimeType") = $${params.length}`);
  }
  if (input.authorId) {
    params.push(input.authorId);
    clauses.push(`m."uploaderId" = $${params.length}`);
  }
  const page = clamp(input.page, 1, 1, 100000);
  const perPage = clamp(input.perPage, 20, 1, 100);
  return {
    where: clauses.join(' AND '),
    params,
    page,
    perPage,
    offset: (page - 1) * perPage,
  };
}

function clamp(value: number | string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}
