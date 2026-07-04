import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { MediaService } from './media.service';

const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';

const storage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private media: MediaService) {}

  @Get()
  async findAll(@Query('page') page?: string, @Query('perPage') perPage?: string) {
    const [items, total] = await this.media.findAll(
      Number(page ?? 1),
      Number(perPage ?? 24),
    );
    return { items, total };
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body('alt') alt?: string,
  ) {
    return this.media.create(file, user.sub, alt);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body('alt') alt: string) {
    return this.media.update(id, alt);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
