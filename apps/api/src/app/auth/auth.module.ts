import { Logger, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AuthController } from './api/controllers/auth.controller';
import { AuthExceptionFilter } from './api/filters/auth-exception.filter';
import { AuthGuard } from './api/guards/auth.guard';
import { AUTH_COMMAND_HANDLERS } from './api/handlers/auth-command.handlers';
import { AUTH_QUERY_HANDLERS } from './api/handlers/auth-query.handlers';
import { MAILER, type Mailer } from './application/email/mailer.port';
import {
  AccountEmailOperations,
  AccountOperations,
} from './application/repositories/account.operations';
import { AccountEmailsUseCases } from './application/use-cases/account-emails.use-cases';
import { AccountUseCases } from './application/use-cases/account.use-cases';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { IssueSession } from './application/use-cases/issue-session';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { UpdateProfileUseCase } from './application/use-cases/update-profile.use-case';
import { VerifyAccessTokenUseCase } from './application/use-cases/verify-access-token.use-case';
import { LogMailer, ResendMailer } from './infrastructure/email/mailer';
import { PrismaAccountRepository } from './infrastructure/repositories/prisma-account.repository';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository';
import { PrismaEmailTokenRepository } from './infrastructure/repositories/prisma-email-token.repository';
import { NodeAuthCrypto } from './infrastructure/security/node-auth.crypto';
import { TokenCleanup } from './infrastructure/services/token-cleanup';

@Module({
  imports: [
    CqrsModule.forRoot(),
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
      provide: IssueSession,
      inject: [PrismaAuthRepository, NodeAuthCrypto],
      useFactory: (repository: PrismaAuthRepository, crypto: NodeAuthCrypto) =>
        new IssueSession(repository, crypto),
    },
    {
      provide: RegisterUseCase,
      inject: [PrismaAuthRepository, NodeAuthCrypto, IssueSession],
      useFactory: (
        repository: PrismaAuthRepository,
        crypto: NodeAuthCrypto,
        issueSession: IssueSession,
      ) => new RegisterUseCase(repository, crypto, issueSession),
    },
    {
      provide: LoginUseCase,
      inject: [PrismaAuthRepository, NodeAuthCrypto, IssueSession],
      useFactory: async (
        repository: PrismaAuthRepository,
        crypto: NodeAuthCrypto,
        issueSession: IssueSession,
      ) => {
        const login = new LoginUseCase(repository, crypto, issueSession);
        await login.initialize();
        return login;
      },
    },
    {
      provide: RefreshSessionUseCase,
      inject: [PrismaAuthRepository, NodeAuthCrypto],
      useFactory: (repository: PrismaAuthRepository, crypto: NodeAuthCrypto) =>
        new RefreshSessionUseCase(repository, crypto),
    },
    {
      provide: LogoutUseCase,
      inject: [PrismaAuthRepository, NodeAuthCrypto],
      useFactory: (repository: PrismaAuthRepository, crypto: NodeAuthCrypto) =>
        new LogoutUseCase(repository, crypto),
    },
    {
      provide: GetCurrentUserUseCase,
      inject: [PrismaAuthRepository],
      useFactory: (repository: PrismaAuthRepository) =>
        new GetCurrentUserUseCase(repository),
    },
    {
      provide: VerifyAccessTokenUseCase,
      inject: [NodeAuthCrypto],
      useFactory: (crypto: NodeAuthCrypto) =>
        new VerifyAccessTokenUseCase(crypto),
    },
    {
      provide: UpdateProfileUseCase,
      inject: [PrismaAuthRepository, GetCurrentUserUseCase],
      useFactory: (
        repository: PrismaAuthRepository,
        currentUser: GetCurrentUserUseCase,
      ) => new UpdateProfileUseCase(repository, currentUser),
    },
    {
      provide: ChangePasswordUseCase,
      inject: [PrismaAuthRepository, NodeAuthCrypto, IssueSession],
      useFactory: (
        repository: PrismaAuthRepository,
        crypto: NodeAuthCrypto,
        issueSession: IssueSession,
      ) => new ChangePasswordUseCase(repository, crypto, issueSession),
    },
    PrismaEmailTokenRepository,
    PrismaAccountRepository,
    {
      provide: AccountEmailsUseCases,
      inject: [PrismaEmailTokenRepository, NodeAuthCrypto, MAILER, ENV],
      useFactory: (
        repository: PrismaEmailTokenRepository,
        crypto: NodeAuthCrypto,
        mailer: Mailer,
        env: Env,
      ) =>
        new AccountEmailsUseCases(
          repository,
          crypto,
          mailer,
          env.PUBLIC_URL,
          new Logger(AccountEmailsUseCases.name),
        ),
    },
    {
      provide: AccountUseCases,
      inject: [PrismaAccountRepository, NodeAuthCrypto],
      useFactory: (
        repository: PrismaAccountRepository,
        crypto: NodeAuthCrypto,
      ) => new AccountUseCases(repository, crypto),
    },
    TokenCleanup,
    { provide: AccountEmailOperations, useExisting: AccountEmailsUseCases },
    { provide: AccountOperations, useExisting: AccountUseCases },
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env): Mailer =>
        env.RESEND_API_KEY
          ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
          : new LogMailer(),
    },
    ...AUTH_COMMAND_HANDLERS,
    ...AUTH_QUERY_HANDLERS,
    AuthGuard,
    AuthExceptionFilter,
  ],
  exports: [AuthGuard, CqrsModule],
})
export class AuthModule {}
