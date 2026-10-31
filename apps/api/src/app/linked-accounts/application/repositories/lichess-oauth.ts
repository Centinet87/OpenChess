export interface LichessOAuth {
  authorizeUrl(state: string, challenge: string): string;
  /** Cambia el código por un token, lee el usuario y revoca el token. */
  usernameFromCode(code: string, verifier: string): Promise<string | null>;
}
export const LICHESS_OAUTH = Symbol('LICHESS_OAUTH');
