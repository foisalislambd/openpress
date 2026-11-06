import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import { unlink } from 'fs/promises';
import { promisify } from 'util';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { buildSrcSet } from '../cms/publishing';
import { enqueue } from '../jobs/queue';
import { clampCrop, plannedSizes, SizeSpec } from './image-sizes';
import { publishObject, publicUrlFor, removeObject, storageDriver } from './storage';
import { currentSiteId } from '../sites/site-context';
import { buildMediaQuery, MediaQueryInput } from './media-query';
import { pdfPreviewArgs } from './pdf-preview';

const execFileAsync = promisify(execFile);

const MEDIA_COLUMNS = `m.id, m.filename, m.url, m."mimeType", m.size, m.width, m.height,
  m.alt, m.caption, m.sizes, m."focalX", m."focalY", m."storageKey", m."uploaderId", m."createdAt"`;

const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

type SizeFile = {
  url: string;
  width: number;
  height: number;
  filename: string;
  formats?: { webp?: { url: string; filename: string }; avif?: { url: string; filename: string } };
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(private db: DbService) {}

  async findAll(input: Omit<MediaQueryInput, 'siteId'> & { viewerId?: string } = {}) {
    const siteId = currentSiteId();
    const built = buildMediaQuery({ ...input, siteId });
    const [items, total, views, months, mimeTypes] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT ${MEDIA_COLUMNS},
                json_build_object('id', u.id, 'name', u.name) AS uploader
         FROM media m
         JOIN users u ON u.id = m."uploaderId"
         WHERE ${built.where}
         ORDER BY m."createdAt" DESC
         LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
        [...built.params, built.perPage, built.offset],
      ),
      this.db.one<{ count: number }>(
        `SELECT count(*)::int AS count FROM media m WHERE ${built.where}`,
        built.params,
      ),
      this.db.one<{ all: number; mine: number; image: number; audio: number; video: number; document: number; other: number }>(
        `SELECT
           count(*)::int AS all,
           count(*) FILTER (WHERE m."uploaderId" = $2)::int AS mine,
           count(*) FILTER (WHERE m."mimeType" LIKE 'image/%')::int AS image,
           count(*) FILTER (WHERE m."mimeType" LIKE 'audio/%')::int AS audio,
           count(*) FILTER (WHERE m."mimeType" LIKE 'video/%')::int AS video,
           count(*) FILTER (WHERE m."mimeType" LIKE 'application/%' OR m."mimeType" LIKE 'text/%')::int AS document,
           count(*) FILTER (WHERE m."mimeType" NOT LIKE 'image/%' AND m."mimeType" NOT LIKE 'audio/%' AND m."mimeType" NOT LIKE 'video/%' AND m."mimeType" NOT LIKE 'application/%' AND m."mimeType" NOT LIKE 'text/%')::int AS other
         FROM media m
         WHERE m."siteId" = $1`,
        [siteId, input.viewerId ?? ''],
      ),
      this.db.query<{ value: string; label: string; count: number }>(
        `SELECT to_char(date_trunc('month', m."createdAt"), 'YYYYMM') AS value,
                to_char(date_trunc('month', m."createdAt"), 'FMMonth YYYY') AS label,
                count(*)::int AS count
         FROM media m
         WHERE m."siteId" = $1
         GROUP BY 1, 2
         ORDER BY 1 DESC`,
        [siteId],
      ),
      this.db.query<{ mimeType: string; count: number }>(
        `SELECT m."mimeType" AS "mimeType", count(*)::int AS count
         FROM media m
         WHERE m."siteId" = $1
         GROUP BY 1
         ORDER BY 2 DESC, 1 ASC`,
        [siteId],
      ),
    ]);
    const count = total?.count ?? 0;
    return {
      items: items.map((item) => this.present(item)),
      total: count,
      page: built.page,
      perPage: built.perPage,
      totalPages: Math.max(1, Math.ceil(count / built.perPage)),
      views: views ?? { all: 0, mine: 0, image: 0, audio: 0, video: 0, document: 0, other: 0 },
      months,
      mimeTypes,
    };
  }

  async findOne(id: string) {
    const media = await this.db.one<Record<string, unknown>>(
      `SELECT ${MEDIA_COLUMNS} FROM media m WHERE m.id = $1 AND m."siteId" = $2`,
      [id, currentSiteId()],
    );
    if (!media) throw new NotFoundException('Media not found');
    return this.present(media);
  }

  async create(file: Express.Multer.File, uploaderId: string, alt?: string) {
    const id = newId();
    await this.db.query(
      `INSERT INTO media (
         id, filename, url, "mimeType", size, alt, sizes, "storageKey", "uploaderId", "siteId"
       ) VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $2, $7, $8)`,
      [id, file.filename, publicUrlFor(file.filename), file.mimetype, file.size, alt ?? null, uploaderId, currentSiteId()],
    );
    const queued = await enqueue('media', { mediaId: id });
    if (!queued) await this.regenerate(id);
    else if (storageDriver() === 's3') {
      const url = await publishObject(file.filename, file.path, file.mimetype);
      await this.db.query('UPDATE media SET url = $2 WHERE id = $1', [id, url]);
    }
    return this.findOne(id);
  }

  async update(id: string, input: { alt?: string; caption?: string; focalX?: number; focalY?: number }) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.alt !== undefined) {
      params.push(input.alt);
      sets.push(`alt = $${params.length}`);
    }
    if (input.caption !== undefined) {
      params.push(input.caption);
      sets.push(`caption = $${params.length}`);
    }
    if (input.focalX !== undefined) {
      params.push(clampUnit(input.focalX));
      sets.push(`"focalX" = $${params.length}`);
    }
    if (input.focalY !== undefined) {
      params.push(clampUnit(input.focalY));
      sets.push(`"focalY" = $${params.length}`);
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to update');
    params.push(id);
    const media = await this.db.one(
      `UPDATE media SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, filename, url, "mimeType", size, width, height, alt, caption, sizes, "uploaderId", "createdAt"`,
      params,
    );
    if (!media) throw new NotFoundException('Media not found');
    return this.findOne(id);
  }

  async transform(id: string, input: { rotate?: number; flip?: 'horizontal' | 'vertical'; width?: number; height?: number }) {
    const media = await this.db.one<{ filename: string; mimeType: string; sizes: Record<string, SizeFile> }>(
      'SELECT filename, "mimeType", sizes FROM media WHERE id = $1',
      [id],
    );
    if (!media) throw new NotFoundException('Media not found');
    if (!RASTER.has(media.mimeType)) throw new BadRequestException('Only raster images can be edited');
    const path = this.filePath(media.filename);
    let pipeline = sharp(path, { animated: false });
    if (input.rotate) pipeline = pipeline.rotate(input.rotate);
    if (input.flip === 'horizontal') pipeline = pipeline.flop();
    if (input.flip === 'vertical') pipeline = pipeline.flip();
    if (input.width || input.height) {
      pipeline = pipeline.resize({
        width: input.width,
        height: input.height,
        fit: 'inside',
        withoutEnlargement: false,
      });
    }
    await this.removeSizeFiles(media.sizes);
    await pipeline.toFile(`${path}.edit`);
    const { rename } = await import('fs/promises');
    await rename(`${path}.edit`, path);
    return this.regenerate(id);
  }

  async regenerate(id: string) {
    const media = await this.db.one<{ filename: string; mimeType: string; sizes: Record<string, SizeFile> }>(
      'SELECT filename, "mimeType", sizes FROM media WHERE id = $1',
      [id],
    );
    if (!media) throw new NotFoundException('Media not found');
    const path = this.filePath(media.filename);
    await this.removeSizeFiles(media.sizes);
    const derived = await this.derivatives(path, media.filename, media.mimeType);
    const { stat } = await import('fs/promises');
    const fileStat = await stat(path).catch(() => null);
    await this.db.query(
      `UPDATE media SET url = $2, width = $3, height = $4, sizes = $5::jsonb, size = COALESCE($6, size), "storageKey" = $7
       WHERE id = $1`,
      [
        id,
        derived.url,
        derived.width,
        derived.height,
        JSON.stringify(derived.sizes),
        fileStat?.size ?? null,
        media.filename,
      ],
    );
    return this.findOne(id);
  }

  async crop(id: string, box: { x: number; y: number; width: number; height: number }) {
    const media = await this.db.one<{
      id: string;
      filename: string;
      mimeType: string;
      width: number | null;
      height: number | null;
      sizes: Record<string, SizeFile>;
    }>(
      'SELECT id, filename, "mimeType", width, height, sizes FROM media WHERE id = $1',
      [id],
    );
    if (!media) throw new NotFoundException('Media not found');
    if (!RASTER.has(media.mimeType) || !media.width || !media.height) {
      throw new BadRequestException('Only raster images can be cropped');
    }
    const region = clampCrop({ width: media.width, height: media.height }, box);
    if (!region) throw new BadRequestException('Crop is outside the image');
    const path = this.filePath(media.filename);
    await this.removeSizeFiles(media.sizes);
    await sharp(path).extract(region).toFile(`${path}.crop`);
    const { rename, stat } = await import('fs/promises');
    await rename(`${path}.crop`, path);
    const derived = await this.derivatives(path, media.filename, media.mimeType);
    const fileStat = await stat(path);
    const updated = await this.db.one(
      `UPDATE media
       SET width = $2, height = $3, sizes = $4::jsonb, size = $5
       WHERE id = $1
       RETURNING id, filename, url, "mimeType", size, width, height, alt, caption, sizes, "uploaderId", "createdAt"`,
      [id, derived.width, derived.height, JSON.stringify(derived.sizes), fileStat.size],
    );
    return updated;
  }

  async remove(id: string) {
    const media = await this.db.one<{ id: string; filename: string; sizes: Record<string, SizeFile> }>(
      'DELETE FROM media WHERE id = $1 AND "siteId" = $2 RETURNING id, filename, sizes',
      [id, currentSiteId()],
    );
    if (!media) throw new NotFoundException('Media not found');
    await unlink(this.filePath(media.filename)).catch(() => {});
    await this.removeSizeFiles(media.sizes);
    return { id: media.id };
  }

  async removeMany(ids: string[]) {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 100);
    const removed: string[] = [];
    for (const id of unique) {
      try {
        await this.remove(id);
        removed.push(id);
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return { removed };
  }

  private async derivatives(path: string, filename: string, mimeType: string) {
    const originalUrl = await publishObject(filename, path, mimeType).catch(() => publicUrlFor(filename));
    if (mimeType === 'application/pdf') return this.pdfThumbnail(path, filename, originalUrl);
    if (!RASTER.has(mimeType)) return { width: null as number | null, height: null as number | null, sizes: {}, url: originalUrl };
    try {
      const image = sharp(path, { animated: false });
      const meta = await image.metadata();
      const width = meta.width ?? null;
      const height = meta.height ?? null;
      if (!width || !height) return { width, height, sizes: {}, url: originalUrl };
      const widths = await this.sizeSpec();
      const sizes: Record<string, SizeFile> = {};
      const ext = extname(filename);
      const stem = basename(filename, ext);
      for (const planned of plannedSizes(width, widths)) {
        const variantExt = ext === '.gif' ? '.png' : ext;
        const variant = `${stem}-${planned.name}${variantExt}`;
        const out = this.filePath(variant);
        const info = await sharp(path)
          .resize({ width: planned.width, withoutEnlargement: true })
          .toFile(out);
        const formats = await this.writeFormats(path, stem, planned.name, planned.width);
        sizes[planned.name] = {
          url: await publishObject(variant, out, mimeType),
          width: info.width,
          height: info.height,
          filename: variant,
          formats,
        };
      }
      return { width, height, sizes, url: originalUrl };
    } catch (error) {
      this.logger.warn(`Could not build image sizes for ${filename}: ${error}`);
      return { width: null, height: null, sizes: {}, url: originalUrl };
    }
  }

  private async pdfThumbnail(path: string, filename: string, originalUrl: string) {
    const stem = basename(filename, extname(filename));
    const prefix = this.filePath(`${stem}-pdf`);
    try {
      await execFileAsync('pdftoppm', pdfPreviewArgs(path, prefix));
      const rendered = `${prefix}.png`;
      const thumbName = `${stem}-thumbnail.png`;
      const thumbPath = this.filePath(thumbName);
      const info = await sharp(rendered).resize({ width: 150, withoutEnlargement: true }).png().toFile(thumbPath);
      await unlink(rendered).catch(() => {});
      return {
        width: info.width,
        height: info.height,
        sizes: {
          thumbnail: {
            url: await publishObject(thumbName, thumbPath, 'image/png'),
            width: info.width,
            height: info.height,
            filename: thumbName,
          },
        },
        url: originalUrl,
      };
    } catch (error) {
      this.logger.warn(`Could not render a PDF thumbnail for ${filename}: ${error}`);
      return { width: null, height: null, sizes: {}, url: originalUrl };
    }
  }

  private async writeFormats(path: string, stem: string, name: string, width: number) {
    const formats: SizeFile['formats'] = {};
    for (const format of ['webp', 'avif'] as const) {
      const filename = `${stem}-${name}.${format}`;
      const out = this.filePath(filename);
      await sharp(path).resize({ width, withoutEnlargement: true }).toFormat(format).toFile(out);
      formats[format] = { filename, url: await publishObject(filename, out, `image/${format}`) };
    }
    return formats;
  }

  private present(media: Record<string, unknown>) {
    const sizes = (media.sizes ?? {}) as Record<string, SizeFile>;
    const full = { url: String(media.url ?? ''), width: Number(media.width) || null };
    return {
      ...media,
      srcset: buildSrcSet(full, sizes, 'original'),
      webpSrcset: buildSrcSet(full, sizes, 'webp'),
      avifSrcset: buildSrcSet(full, sizes, 'avif'),
    };
  }

  private async sizeSpec(): Promise<SizeSpec> {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
      [['thumbnailSize', 'mediumSize', 'largeSize']],
    );
    const stored = Object.fromEntries(rows.map((row) => [row.key, Number(row.value)]));
    return {
      thumbnail: positive(stored.thumbnailSize, 150),
      medium: positive(stored.mediumSize, 300),
      large: positive(stored.largeSize, 1024),
    };
  }

  async terms(mediaId: string) {
    const media = await this.db.one('SELECT id FROM media WHERE id = $1 AND "siteId" = $2', [mediaId, currentSiteId()]);
    if (!media) throw new NotFoundException('Media not found');
    return this.db.query(
      `SELECT t.id, t.name, t.slug, t.taxonomy
       FROM media_terms mt JOIN terms t ON t.id = mt."termId"
       WHERE mt."mediaId" = $1
       ORDER BY t.name`,
      [mediaId],
    );
  }

  async setTerms(mediaId: string, termIds: string[]) {
    const media = await this.db.one('SELECT id FROM media WHERE id = $1 AND "siteId" = $2', [mediaId, currentSiteId()]);
    if (!media) throw new NotFoundException('Media not found');
    const unique = [...new Set(termIds.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 40);
    await this.db.tx(async (sql) => {
      await sql.query('DELETE FROM media_terms WHERE "mediaId" = $1', [mediaId]);
      for (const termId of unique) {
        const term = await sql.one('SELECT id FROM terms WHERE id = $1 AND "siteId" = $2', [termId, currentSiteId()]);
        if (!term) throw new BadRequestException('Unknown term');
        await sql.query('INSERT INTO media_terms ("mediaId", "termId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [mediaId, termId]);
      }
    });
    return this.terms(mediaId);
  }

  private async removeSizeFiles(sizes: Record<string, SizeFile> | null) {
    if (!sizes) return;
    for (const size of Object.values(sizes)) {
      const names = [size?.filename, size?.formats?.webp?.filename, size?.formats?.avif?.filename];
      for (const name of names) {
        if (!name) continue;
        await unlink(this.filePath(name)).catch(() => {});
        await removeObject(name);
      }
    }
  }

  private filePath(filename: string) {
    const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
    return join(process.cwd(), uploadDir, filename);
  }
}

function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}
