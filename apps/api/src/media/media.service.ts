import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { buildSrcSet } from '../cms/publishing';
import { enqueue } from '../jobs/queue';
import { clampCrop, plannedSizes, SizeSpec } from './image-sizes';
import { publishObject, publicUrlFor, removeObject, storageDriver } from './storage';
import { currentSiteId } from '../sites/site-context';

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

  async findAll(page = 1, perPage = 24) {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const safePerPage =
      Number.isFinite(perPage) && perPage >= 1 ? Math.min(100, Math.floor(perPage)) : 24;
    const [items, total] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT ${MEDIA_COLUMNS},
                json_build_object('id', u.id, 'name', u.name) AS uploader
         FROM media m
         JOIN users u ON u.id = m."uploaderId"
         WHERE m."siteId" = $3
         ORDER BY m."createdAt" DESC
         LIMIT $1 OFFSET $2`,
        [safePerPage, (safePage - 1) * safePerPage, currentSiteId()],
      ),
      this.db.one<{ count: number }>('SELECT count(*)::int AS count FROM media WHERE "siteId" = $1', [currentSiteId()]),
    ]);
    return [items.map((item) => this.present(item)), total?.count ?? 0] as const;
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
      'DELETE FROM media WHERE id = $1 RETURNING id, filename, sizes',
      [id],
    );
    if (!media) throw new NotFoundException('Media not found');
    await unlink(this.filePath(media.filename)).catch(() => {});
    await this.removeSizeFiles(media.sizes);
    return { id: media.id };
  }

  private async derivatives(path: string, filename: string, mimeType: string) {
    const originalUrl = await publishObject(filename, path, mimeType).catch(() => publicUrlFor(filename));
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
