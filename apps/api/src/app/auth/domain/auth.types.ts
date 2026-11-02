export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_GRACE_MS = 10_000;

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
  exp?: number;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface Registration {
  session: Session;
  userId: string;
}
