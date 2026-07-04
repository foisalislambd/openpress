import { Injectable, NotFoundException } from '@nestjs/common';
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

  remove(id: string) {
    return this.prisma.user.delete({ where: { id }, select: { id: true } });
  }
}
