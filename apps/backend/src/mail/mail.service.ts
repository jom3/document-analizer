import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private resend: Resend | null = null;

  private get from(): string {
    return process.env.RESEND_FROM ?? 'Document Analyzer <onboarding@resend.dev>';
  }

  private get client(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('MailService: RESEND_API_KEY is not configured');
    }
    this.resend ??= new Resend(apiKey);
    return this.resend;
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    await this.client.emails.send({
      from: this.from,
      to,
      subject: 'Verifica tu email — Document Analyzer',
      html: `<p>Haz clic en el siguiente enlace para verificar tu email:</p><p><a href="${link}">${link}</a></p><p>El enlace expira en 24 horas.</p>`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await this.client.emails.send({
      from: this.from,
      to,
      subject: 'Recupera tu contraseña — Document Analyzer',
      html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p><p><a href="${link}">${link}</a></p><p>El enlace expira en 24 horas.</p>`,
    });
  }
}
