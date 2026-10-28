import { Injectable, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { DbService } from '../db/db.service';
import { newId } from '../db/ids';

const MEDIA_COLUMNS = `m.id, m.filename, m.url, m."mimeType", m.size, m.width, m.height,
  m.alt, m."uploaderId", m."createdAt"`;

@Injectable()
export class MediaService {
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

  create(file: Express.Multer.File, uploaderId: string, alt?: string) {
    return this.db.one(
      `INSERT INTO media (id, filename, url, "mimeType", size, alt, "uploaderId")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, filename, url, "mimeType", size, width, height, alt, "uploaderId", "createdAt"`,
      [
        newId(),
        file.filename,
        `/uploads/${file.filename}`,
        file.mimetype,
        file.size,
        alt ?? null,
        uploaderId,
      ],
    );
  }

  async update(id: string, alt: string) {
    const media = await this.db.one(
      `UPDATE media SET alt = $2
       WHERE id = $1
       RETURNING id, filename, url, "mimeType", size, width, height, alt, "uploaderId", "createdAt"`,
      [id, alt],
    );
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  async remove(id: string) {
    const media = await this.db.one<{ id: string; filename: string }>(
      'DELETE FROM media WHERE id = $1 RETURNING id, filename',
      [id],
    );
    if (!media) throw new NotFoundException('Media not found');
    const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
    await unlink(join(process.cwd(), uploadDir, media.filename)).catch(() => {});
    return { id: media.id };
  }
}
