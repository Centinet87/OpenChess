export type AccountErrorCode =
  | 'incorrect_password'
  | 'invalid_link'
  | 'same_email'
  | 'EMAIL_TAKEN'
  | 'LAST_OWNER'
  | 'SUBSCRIPTION_ACTIVE'
  | 'GAME_IN_PROGRESS';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
    readonly clubs?: { slug: string; name: string }[],
  ) {
    super(message);
  }
}
