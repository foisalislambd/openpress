import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Put,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CapabilitiesService } from '../auth/capabilities.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt.strategy';
import { MediaService } from './media.service';

class UpdateMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  focalY?: number;
}

class TransformDto {
  @IsOptional()
  @IsInt()
  rotate?: number;

  @IsOptional()
  @IsIn(['horizontal', 'vertical'])
  flip?: 'horizontal' | 'vertical';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8000)
  height?: number;
}

class CropDto {
  @IsInt()
  @Min(0)
  x: number;

  @IsInt()
  @Min(0)
  y: number;

  @IsInt()
  @Min(1)
  @Max(20000)
  width: number;

  @IsInt()
  @Min(1)
  @Max(20000)
  height: number;
}

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
  constructor(
    private media: MediaService,
    private caps: CapabilitiesService,
  ) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
    @Query('month') month?: string,
    @Query('mime') mime?: string,
    @Query('author') author?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return this.media.findAll({
      page,
      perPage,
      search,
      month,
      mime,
      authorId: author === 'me' ? user?.sub : undefined,
      viewerId: user?.sub,
    });
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() body: { ids?: string[] }, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) {
      throw new ForbiddenException('You cannot delete files');
    }
    return this.media.removeMany(Array.isArray(body.ids) ? body.ids : []);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml',
          'image/avif',
          'video/mp4',
          'video/webm',
          'audio/mpeg',
          'application/pdf',
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`File type ${file.mimetype} is not allowed`), false);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Body('alt') alt?: string,
  ) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) {
      throw new ForbiddenException('You cannot upload files');
    }
    if (!file) throw new BadRequestException('No file uploaded');
    return this.media.create(file, user.sub, alt);
  }

  @Get(':id/terms')
  terms(@Param('id') id: string) {
    return this.media.terms(id);
  }

  @Put(':id/terms')
  async setTerms(@Param('id') id: string, @Body() body: { termIds?: string[] }, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) throw new ForbiddenException('You cannot edit files');
    return this.media.setTerms(id, Array.isArray(body.termIds) ? body.termIds : []);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.media.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateMediaDto, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) throw new ForbiddenException('You cannot edit files');
    return this.media.update(id, dto);
  }

  @Post(':id/transform')
  async transform(@Param('id') id: string, @Body() dto: TransformDto, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) throw new ForbiddenException('You cannot edit files');
    return this.media.transform(id, dto);
  }

  @Post(':id/regenerate')
  async regenerate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) throw new ForbiddenException('You cannot edit files');
    return this.media.regenerate(id);
  }

  @Post(':id/crop')
  async crop(@Param('id') id: string, @Body() dto: CropDto, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) {
      throw new ForbiddenException('You cannot edit files');
    }
    return this.media.crop(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (!(await this.caps.allows(user.sub, 'upload_files'))) throw new ForbiddenException('You cannot delete files');
    return this.media.remove(id);
  }
}
