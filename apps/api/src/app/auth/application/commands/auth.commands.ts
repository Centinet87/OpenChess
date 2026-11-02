import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from '../../domain/auth.types';
export type { LoginInput, RegisterInput } from '../../domain/auth.types';

export class RegisterCommand {
  constructor(readonly input: RegisterInput) {}
}

export class LoginCommand {
  constructor(readonly input: LoginInput) {}
}

export class RefreshSessionCommand {
  constructor(readonly refreshToken: string | undefined) {}
}

export class LogoutCommand {
  constructor(readonly refreshToken: string | undefined) {}
}

export class UpdateProfileCommand {
  constructor(
    readonly userId: string,
    readonly input: { displayName: string },
  ) {}
}

export class ChangePasswordCommand {
  constructor(
    readonly userId: string,
    readonly input: ChangePasswordInput,
  ) {}
}

export class QueueVerificationCommand {
  constructor(readonly userId: string) {}
}

export class VerifyEmailCommand {
  constructor(readonly token: string) {}
}

export class RequestPasswordResetCommand {
  constructor(readonly email: string) {}
}

export class ResetPasswordCommand {
  constructor(
    readonly token: string,
    readonly password: string,
  ) {}
}

export class RequestEmailChangeCommand {
  constructor(
    readonly userId: string,
    readonly password: string,
    readonly newEmail: string,
  ) {}
}

export class ConfirmEmailChangeCommand {
  constructor(readonly token: string) {}
}

export class DeleteAccountCommand {
  constructor(
    readonly userId: string,
    readonly password: string,
  ) {}
}
