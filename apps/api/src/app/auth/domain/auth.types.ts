export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenPayload {
  sub: string;
}
