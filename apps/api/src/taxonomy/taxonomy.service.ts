import { Injectable } from '@nestjs/common';
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

  createCategory(name: string, description?: string, parentId?: string) {
    return this.prisma.category.create({
      data: {
        name,
        slug: slugify(name, { lower: true, strict: true }),
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

  createTag(name: string) {
    return this.prisma.tag.create({
      data: { name, slug: slugify(name, { lower: true, strict: true }) },
    });
  }

  removeTag(id: string) {
    return this.prisma.tag.delete({ where: { id }, select: { id: true } });
  }
}
