import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { IssueSession } from './application/use-cases/issue-session';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { GetCurrentUserUseCase } from './application/use-cases/get-current-user.use-case';
import { VerifyAccessTokenUseCase } from './application/use-cases/verify-access-token.use-case';
import { AuthController } from './api/controllers/auth.controller';
import { AuthExceptionFilter } from './api/filters/auth-exception.filter';
import { AuthGuard } from './api/guards/auth.guard';
import { AUTH_COMMAND_HANDLERS } from './api/handlers/auth-command.handlers';
import { AUTH_QUERY_HANDLERS } from './api/handlers/auth-query.handlers';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth.repository';
import { NodeAuthCrypto } from './infrastructure/security/node-auth.crypto';

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
    ...AUTH_COMMAND_HANDLERS,
    ...AUTH_QUERY_HANDLERS,
    AuthGuard,
    AuthExceptionFilter,
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
