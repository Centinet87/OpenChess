import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  LoginCommand,
  LogoutCommand,
  RefreshSessionCommand,
  RegisterCommand,
} from '../../application/commands/auth.commands';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import type { Session } from '../../domain/auth.types';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<
  RegisterCommand,
  Session
> {
  constructor(private readonly useCase: RegisterUseCase) {}

  execute(command: RegisterCommand): Promise<Session> {
    return this.useCase.execute(command.input);
  }
}

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, Session> {
  constructor(private readonly useCase: LoginUseCase) {}

  execute(command: LoginCommand): Promise<Session> {
    return this.useCase.execute(command.input);
  }
}

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<
  RefreshSessionCommand,
  Session
> {
  constructor(private readonly useCase: RefreshSessionUseCase) {}

  execute(command: RefreshSessionCommand): Promise<Session> {
    return this.useCase.execute(command.refreshToken);
  }
}

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand, void> {
  constructor(private readonly useCase: LogoutUseCase) {}

  execute(command: LogoutCommand): Promise<void> {
    return this.useCase.execute(command.refreshToken);
  }
}

export const AUTH_COMMAND_HANDLERS = [
  RegisterHandler,
  LoginHandler,
  RefreshSessionHandler,
  LogoutHandler,
];
