export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

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
