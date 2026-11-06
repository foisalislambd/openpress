import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApiKeyService } from './api-key.service';
import { AppPasswordService } from './app-password.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SecurityService } from './security.service';

@Module({
  imports: [
    PassportModule,
    // registerAsync ensures secrets are read AFTER ConfigModule loads .env,
    // so sign and verify always use the same secret.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'openpress-dev-secret',
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AppPasswordService, ApiKeyService, SecurityService],
  exports: [AuthService, AppPasswordService, ApiKeyService, JwtModule],
})
export class AuthModule {}
