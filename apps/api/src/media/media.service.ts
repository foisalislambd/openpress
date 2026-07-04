import { Injectable, NotFoundException } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  findAll(page = 1, perPage = 24) {
    return this.prisma.$transaction([
      this.prisma.media.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { uploader: { select: { id: true, name: true } } },
      }),
      this.prisma.media.count(),
    ]);
  }

  create(file: Express.Multer.File, uploaderId: string, alt?: string) {
    return this.prisma.media.create({
      data: {
        filename: file.filename,
        url: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
        alt,
        uploaderId,
      },
    });
  }

  async update(id: string, alt: string) {
    return this.prisma.media.update({ where: { id }, data: { alt } });
  }

  async remove(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    await this.prisma.media.delete({ where: { id } });
    const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
    await unlink(join(process.cwd(), uploadDir, media.filename)).catch(() => {});
    return { id };
  }
}
