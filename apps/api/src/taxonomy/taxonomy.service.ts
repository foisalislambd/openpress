import { BadRequestException, Injectable } from '@nestjs/common';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaxonomyService {
  constructor(private prisma: PrismaService) {}

  categories() {
    return this.prisma.category.findMany({
      include: { _count: { select: { contents: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(name: string, description?: string, parentId?: string) {
    if (parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('Parent category was not found');
    }
    return this.prisma.category.create({
      data: {
        name,
        slug: await this.uniqueSlug('category', name),
        description,
        parentId: parentId || null,
      },
    });
  }

  updateCategory(id: string, name?: string, description?: string) {
    return this.prisma.category.update({
      where: { id },
      data: {
        name,
        slug: name ? slugify(name, { lower: true, strict: true }) : undefined,
        description,
      },
    });
  }

  removeCategory(id: string) {
    return this.prisma.category.delete({ where: { id }, select: { id: true } });
  }

  tags() {
    return this.prisma.tag.findMany({
      include: { _count: { select: { contents: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createTag(name: string) {
    return this.prisma.tag.create({
      data: { name, slug: await this.uniqueSlug('tag', name) },
    });
  }

  private async uniqueSlug(kind: 'category' | 'tag', name: string) {
    const base = slugify(name, { lower: true, strict: true }) || 'term';
    let slug = base;
    let i = 1;
    for (;;) {
      const clash =
        kind === 'category'
          ? await this.prisma.category.findUnique({ where: { slug } })
          : await this.prisma.tag.findUnique({ where: { slug } });
      if (!clash) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }

  removeTag(id: string) {
    return this.prisma.tag.delete({ where: { id }, select: { id: true } });
  }
}
