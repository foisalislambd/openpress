import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { AppPasswordService } from './app-password.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

class AppPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private appPasswords: AppPasswordService,
  ) {}

  // Stricter limits on credential endpoints to slow brute-force attempts
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { sub: string }) {
    return this.auth.me(user.sub);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: { sub: string }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.sub, dto);
  }

  @Get('application-passwords')
  @UseGuards(JwtAuthGuard)
  appPasswordList(@CurrentUser() user: { sub: string }) {
    return this.appPasswords.list(user.sub);
  }

  @Post('application-passwords')
  @UseGuards(JwtAuthGuard)
  appPasswordCreate(@CurrentUser() user: { sub: string }, @Body() dto: AppPasswordDto) {
    return this.appPasswords.create(user.sub, dto.name);
  }

  @Delete('application-passwords/:id')
  @UseGuards(JwtAuthGuard)
  appPasswordRemove(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.appPasswords.remove(user.sub, id);
  }
}
