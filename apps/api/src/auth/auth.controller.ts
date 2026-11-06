import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { IsArray, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';
import { ApiKeyService } from './api-key.service';
import { AppPasswordService } from './app-password.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { JwtPayload } from './jwt.strategy';
import { SecurityService } from './security.service';

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

class MfaDto {
  @IsString()
  ticket!: string;

  @IsString()
  code!: string;
}

class CodeDto {
  @IsString()
  code!: string;
}

class ApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsArray()
  scopes?: string[];
}

class ExchangeDto {
  @IsString()
  code!: string;
}

class PasskeyDto {
  @IsObject()
  response!: RegistrationResponseJSON;
}

class PasskeyLoginOptionsDto {
  @IsOptional()
  @IsString()
  email?: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private appPasswords: AppPasswordService,
    private apiKeys: ApiKeyService,
    private security: SecurityService,
  ) {}

  // Stricter limits on credential endpoints to slow brute-force attempts
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, meta(req));
  }

  @Post('mfa')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  mfa(@Body() dto: MfaDto, @Req() req: Request) {
    return this.auth.confirmMfa(dto.ticket, dto.code, (userId, code) => this.security.verifyUserCode(userId, code), meta(req));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, meta(req));
  }

  @Get('oauth/providers')
  providers() {
    return this.security.providers();
  }

  @Get('oauth/:provider/start')
  startOAuth(@Param('provider') provider: string) {
    return this.security.beginOAuth(provider === 'github' ? 'github' : 'google');
  }

  @Get('oauth/:provider/callback')
  async oauthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const result = await this.security.finishOAuth(provider === 'github' ? 'github' : 'google', code, state);
    res.redirect(result.redirect);
  }

  @Post('oauth/exchange')
  exchange(@Body() dto: ExchangeDto, @Req() req: Request) {
    return this.security.exchangeOAuth(dto.code, meta(req));
  }

  @Post('totp/setup')
  @UseGuards(JwtAuthGuard)
  totpSetup(@CurrentUser() user: JwtPayload) {
    return this.security.setupTotp(user.sub, user.email);
  }

  @Post('totp/confirm')
  @UseGuards(JwtAuthGuard)
  totpConfirm(@CurrentUser() user: JwtPayload, @Body() dto: CodeDto) {
    return this.security.confirmTotp(user.sub, dto.code);
  }

  @Delete('totp')
  @UseGuards(JwtAuthGuard)
  totpDisable(@CurrentUser() user: JwtPayload) {
    return this.security.disableTotp(user.sub);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  sessions(@CurrentUser() user: JwtPayload) {
    return this.security.listSessions(user.sub);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.security.revokeSession(user.sub, id);
  }

  @Post('passkeys/register/options')
  @UseGuards(JwtAuthGuard)
  passkeyOptions(@CurrentUser() user: JwtPayload) {
    return this.security.registrationOptions(user.sub, user.email);
  }

  @Post('passkeys/register/verify')
  @UseGuards(JwtAuthGuard)
  passkeyVerify(@CurrentUser() user: JwtPayload, @Body() body: PasskeyDto) {
    return this.security.verifyRegistration(user.sub, body.response);
  }

  @Post('passkeys/login/options')
  passkeyLoginOptions(@Body() body: PasskeyLoginOptionsDto) {
    return this.security.loginOptions(body.email);
  }

  @Post('passkeys/login/verify')
  passkeyLogin(@Body() body: PasskeyDto, @Req() req: Request) {
    return this.security.verifyLogin(body.response as unknown as AuthenticationResponseJSON, meta(req));
  }

  @Get('api-keys')
  @UseGuards(JwtAuthGuard)
  apiKeyList(@CurrentUser() user: JwtPayload) {
    return this.apiKeys.list(user.sub);
  }

  @Post('api-keys')
  @UseGuards(JwtAuthGuard)
  apiKeyCreate(@CurrentUser() user: JwtPayload, @Body() dto: ApiKeyDto) {
    return this.apiKeys.create(user.sub, dto.name, dto.scopes);
  }

  @Delete('api-keys/:id')
  @UseGuards(JwtAuthGuard)
  apiKeyRemove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.apiKeys.remove(user.sub, id);
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

function meta(req: Request) {
  return {
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    ip: req.ip,
  };
}
