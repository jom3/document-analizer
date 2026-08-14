import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AccessTokenStrategy } from './strategies/access-token.strategy.js';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy.js';

@Module({
  imports: [JwtModule.register({}), PassportModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenStrategy, RefreshTokenStrategy, JwtAuthGuard],
})
export class AuthModule {}
