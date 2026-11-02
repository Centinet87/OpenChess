import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  LoginCommand,
  LogoutCommand,
  RefreshSessionCommand,
  RegisterCommand,
  UpdateProfileCommand,
  ChangePasswordCommand,
  QueueVerificationCommand,
  VerifyEmailCommand,
  RequestPasswordResetCommand,
  ResetPasswordCommand,
  RequestEmailChangeCommand,
  ConfirmEmailChangeCommand,
  DeleteAccountCommand,
} from '../../application/commands/auth.commands';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { RegisterUseCase } from '../../application/use-cases/register.use-case';
import type { Registration, Session } from '../../domain/auth.types';
import type { UserProfile } from '../../domain/entities/user.entity';
import {
  AccountEmailOperations,
  AccountOperations,
} from '../../application/repositories/account.operations';
import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';

@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<
  RegisterCommand,
  Registration
> {
  constructor(
    private readonly useCase: RegisterUseCase,
    private readonly emails: AccountEmailOperations,
  ) {}

  async execute(command: RegisterCommand): Promise<Registration> {
    const registered = await this.useCase.execute(command.input);
    this.emails.queueVerification(registered.userId);
    return registered;
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

@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler implements ICommandHandler<
  UpdateProfileCommand,
  UserProfile
> {
  constructor(private readonly useCase: UpdateProfileUseCase) {}
  execute(command: UpdateProfileCommand): Promise<UserProfile> {
    return this.useCase.execute(command.userId, command.input);
  }
}

@CommandHandler(ChangePasswordCommand)
export class ChangePasswordHandler implements ICommandHandler<
  ChangePasswordCommand,
  Session
> {
  constructor(
    private readonly useCase: ChangePasswordUseCase,
    private readonly emails: AccountEmailOperations,
  ) {}
  async execute(command: ChangePasswordCommand): Promise<Session> {
    const session = await this.useCase.execute(command.userId, command.input);
    this.emails.queuePasswordChanged(command.userId);
    return session;
  }
}

@CommandHandler(QueueVerificationCommand)
export class QueueVerificationHandler implements ICommandHandler<
  QueueVerificationCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  async execute(command: QueueVerificationCommand): Promise<void> {
    this.emails.queueVerification(command.userId);
  }
}

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<
  VerifyEmailCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  execute(command: VerifyEmailCommand): Promise<void> {
    return this.emails.verifyEmail(command.token);
  }
}

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler implements ICommandHandler<
  RequestPasswordResetCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  async execute(command: RequestPasswordResetCommand): Promise<void> {
    this.emails.requestPasswordReset(command.email);
  }
}

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler implements ICommandHandler<
  ResetPasswordCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  execute(command: ResetPasswordCommand): Promise<void> {
    return this.emails.resetPassword(command.token, command.password);
  }
}

@CommandHandler(RequestEmailChangeCommand)
export class RequestEmailChangeHandler implements ICommandHandler<
  RequestEmailChangeCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  execute(command: RequestEmailChangeCommand): Promise<void> {
    return this.emails.requestEmailChange(
      command.userId,
      command.password,
      command.newEmail,
    );
  }
}

@CommandHandler(ConfirmEmailChangeCommand)
export class ConfirmEmailChangeHandler implements ICommandHandler<
  ConfirmEmailChangeCommand,
  void
> {
  constructor(private readonly emails: AccountEmailOperations) {}
  execute(command: ConfirmEmailChangeCommand): Promise<void> {
    return this.emails.confirmEmailChange(command.token);
  }
}

@CommandHandler(DeleteAccountCommand)
export class DeleteAccountHandler implements ICommandHandler<
  DeleteAccountCommand,
  void
> {
  constructor(private readonly account: AccountOperations) {}
  execute(command: DeleteAccountCommand): Promise<void> {
    return this.account.delete(command.userId, command.password);
  }
}

export const AUTH_COMMAND_HANDLERS = [
  RegisterHandler,
  LoginHandler,
  RefreshSessionHandler,
  LogoutHandler,
  UpdateProfileHandler,
  ChangePasswordHandler,
  QueueVerificationHandler,
  VerifyEmailHandler,
  RequestPasswordResetHandler,
  ResetPasswordHandler,
  RequestEmailChangeHandler,
  ConfirmEmailChangeHandler,
  DeleteAccountHandler,
];
