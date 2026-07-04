import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  bio: true,
  createdAt: true,
  _count: { select: { contents: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: publicSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role ?? 'AUTHOR',
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: publicSelect,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    // Never allow demoting the last remaining admin
    if (dto.role && dto.role !== 'ADMIN') {
      const target = await this.prisma.user.findUnique({ where: { id } });
      if (target?.role === 'ADMIN') {
        const adminCount = await this.prisma.user.count({
          where: { role: 'ADMIN' },
        });
        if (adminCount <= 1) {
          throw new BadRequestException(
            'Cannot demote the last administrator',
          );
        }
      }
    }
    const data: Record<string, unknown> = {
      name: dto.name,
      role: dto.role,
      bio: dto.bio,
      avatarUrl: dto.avatarUrl,
    };
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.update({
      where: { id },
      data,
      select: publicSelect,
    });
  }

  async remove(id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { contents: true, media: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last administrator');
      }
    }
    if (target._count.contents > 0 || target._count.media > 0) {
      throw new BadRequestException(
        'This user still owns content or media. Reassign or delete it first.',
      );
    }
    return this.prisma.user.delete({ where: { id }, select: { id: true } });
  }
}
