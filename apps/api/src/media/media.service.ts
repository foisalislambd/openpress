import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { basename, extname, join } from 'path';
import sharp from 'sharp';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';
import { clampCrop, plannedSizes, SizeSpec } from './image-sizes';

const MEDIA_COLUMNS = `m.id, m.filename, m.url, m."mimeType", m.size, m.width, m.height,
  m.alt, m.caption, m.sizes, m."uploaderId", m."createdAt"`;

const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

type SizeFile = { url: string; width: number; height: number; filename: string };

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(private db: DbService) {}

  async findAll(page = 1, perPage = 24) {
    const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
    const safePerPage =
      Number.isFinite(perPage) && perPage >= 1 ? Math.min(100, Math.floor(perPage)) : 24;
    const [items, total] = await Promise.all([
      this.db.query(
        `SELECT ${MEDIA_COLUMNS},
                json_build_object('id', u.id, 'name', u.name) AS uploader
         FROM media m
         JOIN users u ON u.id = m."uploaderId"
         ORDER BY m."createdAt" DESC
         LIMIT $1 OFFSET $2`,
        [safePerPage, (safePage - 1) * safePerPage],
      ),
      this.db.one<{ count: number }>('SELECT count(*)::int AS count FROM media'),
    ]);
    return [items, total?.count ?? 0] as const;
  }

  async create(file: Express.Multer.File, uploaderId: string, alt?: string) {
    const derived = await this.derivatives(file.path, file.filename, file.mimetype);
    return this.db.one(
      `INSERT INTO media (
         id, filename, url, "mimeType", size, width, height, alt, sizes, "uploaderId"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING id, filename, url, "mimeType", size, width, height, alt, caption, sizes, "uploaderId", "createdAt"`,
      [
        newId(),
        file.filename,
        `/uploads/${file.filename}`,
        file.mimetype,
        file.size,
        derived.width,
        derived.height,
        alt ?? null,
        JSON.stringify(derived.sizes),
        uploaderId,
      ],
    );
  }

  async update(id: string, input: { alt?: string; caption?: string }) {
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
    if (sets.length === 0) throw new BadRequestException('Nothing to update');
    params.push(id);
    const media = await this.db.one(
      `UPDATE media SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, filename, url, "mimeType", size, width, height, alt, caption, sizes, "uploaderId", "createdAt"`,
      params,
    );
    if (!media) throw new NotFoundException('Media not found');
    return media;
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
    if (!RASTER.has(mimeType)) return { width: null as number | null, height: null, sizes: {} };
    try {
      const image = sharp(path, { animated: false });
      const meta = await image.metadata();
      const width = meta.width ?? null;
      const height = meta.height ?? null;
      if (!width || !height) return { width, height, sizes: {} };
      const widths = await this.sizeSpec();
      const sizes: Record<string, SizeFile> = {};
      const ext = extname(filename);
      const stem = basename(filename, ext);
      for (const planned of plannedSizes(width, widths)) {
        const variant = `${stem}-${planned.name}${ext === '.gif' ? '.png' : ext}`;
        const out = this.filePath(variant);
        const info = await sharp(path)
          .resize({ width: planned.width, withoutEnlargement: true })
          .toFile(out);
        sizes[planned.name] = {
          url: `/uploads/${variant}`,
          width: info.width,
          height: info.height,
          filename: variant,
        };
      }
      return { width, height, sizes };
    } catch (error) {
      this.logger.warn(`Could not build image sizes for ${filename}: ${error}`);
      return { width: null, height: null, sizes: {} };
    }
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
      if (size?.filename) await unlink(this.filePath(size.filename)).catch(() => {});
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
