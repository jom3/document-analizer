import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requireEnv } from './require-env.js';

const TOKEN_EXPIRES_MS = 24 * 60 * 60 * 1000;

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccessToken(userId: string, email: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: requireEnv('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl('JWT_ACCESS_TTL'),
      },
    );
  }

  private signRefreshToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, jti: randomBytes(16).toString('hex') },
      {
        secret: requireEnv('JWT_REFRESH_SECRET'),
        expiresIn: this.ttl('JWT_REFRESH_TTL'),
      },
    );
  }

  private ttl(name: string): JwtSignOptions['expiresIn'] {
    return requireEnv(name) as JwtSignOptions['expiresIn'];
  }

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(32).toString('hex');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerificationToken: this.hashToken(verificationToken),
        emailVerificationTokenExpires: new Date(Date.now() + TOKEN_EXPIRES_MS),
      },
    });

    await this.mail.sendVerificationEmail(email, verificationToken);

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    };
  }

  async verifyEmail(token: string): Promise<void> {
    const hash = this.hashToken(token);
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationToken: hash },
    });

    if (
      !user ||
      !user.emailVerificationTokenExpires ||
      user.emailVerificationTokenExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpires: null,
      },
    });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.emailVerified) throw new ForbiddenException('Email not verified');

    const tokens = await this.issueTokens(user.id, user.email);
    return { ...tokens, user: { id: user.id, email: user.email } };
  }

  async refresh(userId: string): Promise<Tokens> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    return this.issueTokens(user.id, user.email);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const resetToken = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: this.hashToken(resetToken),
        passwordResetTokenExpires: new Date(Date.now() + TOKEN_EXPIRES_MS),
      },
    });
    await this.mail.sendPasswordResetEmail(email, resetToken);
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const hash = this.hashToken(token);
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: hash },
    });

    if (
      !user ||
      !user.passwordResetTokenExpires ||
      user.passwordResetTokenExpires < new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetTokenExpires: null,
      },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return { id: user.id, email: user.email };
  }

  private async issueTokens(userId: string, email: string): Promise<Tokens> {
    return {
      accessToken: await this.signAccessToken(userId, email),
      refreshToken: await this.signRefreshToken(userId),
    };
  }
}
