export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

export interface UserCredentials {
  id: string;
  passwordHash: string;
}

export interface RefreshToken {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
}
