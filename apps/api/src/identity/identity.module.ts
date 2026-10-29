import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AccountEmailsService } from './account-emails.service';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LogMailer, MAILER, ResendMailer, type Mailer } from './mailer';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    AccountEmailsService,
    AccountService,
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env): Mailer =>
        env.RESEND_API_KEY
          ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
          : new LogMailer(),
    },
  ],
  exports: [AuthService, AuthGuard],
})
export class IdentityModule {}
