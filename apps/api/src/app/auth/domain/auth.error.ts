type AuthErrorCode =
  'email_taken' | 'invalid_credentials' | 'invalid_session' | 'user_not_found';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message);
  }
}
