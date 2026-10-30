import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthService } from './application/auth.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { AuthExceptionFilter } from './infrastructure/http/auth-exception.filter';
import { AuthGuard } from './infrastructure/http/auth.guard';
import { PrismaAuthRepository } from './infrastructure/prisma/prisma-auth.repository';
import { NodeAuthCrypto } from './infrastructure/security/node-auth.crypto';
import { AccountEmailsService } from './infrastructure/http/account-emails.service';
import { AccountService } from './infrastructure/http/account.service';
import { TokenCleanup } from './infrastructure/http/token-cleanup';
import {
  LogMailer,
  MAILER,
  ResendMailer,
  type Mailer,
} from './infrastructure/http/mailer';

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
    PrismaAuthRepository,
    NodeAuthCrypto,
    {
      provide: AuthService,
      inject: [PrismaAuthRepository, NodeAuthCrypto],
      useFactory: async (
        repository: PrismaAuthRepository,
        crypto: NodeAuthCrypto,
      ) => {
        const auth = new AuthService(repository, crypto);
        await auth.initialize();
        return auth;
      },
    },
    AuthGuard,
    AuthExceptionFilter,
    AccountEmailsService,
    AccountService,
    TokenCleanup,
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
export class AuthModule {}
