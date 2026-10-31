import { Logger } from '@nestjs/common';
import type { Email, Mailer } from '../../application/email/mailer.port';

/** https://resend.com/docs/api-reference/emails/send-email */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: Email): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, ...email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
    }
  }
}

/** Sin RESEND_API_KEY (desarrollo): el email va al log, con el link para copiarlo. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Email');

  async send(email: Email): Promise<void> {
    this.logger.log(`Para ${email.to} — ${email.subject}\n${email.text}`);
  }
}
