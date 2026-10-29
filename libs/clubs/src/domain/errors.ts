export type ClubErrorCode =
  | 'INVALID_SLUG'
  | 'INVALID_NAME'
  | 'SLUG_TAKEN'
  | 'FORBIDDEN'
  | 'MEMBER_NOT_FOUND'
  | 'LAST_OWNER'
  | 'ALREADY_MEMBER'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_USED'
  | 'ROLE_NOT_FOUND'
  | 'INVALID_ROLE'
  | 'ROLE_IN_USE';

/** Regla de negocio rota. La API traduce el código a un status HTTP. */
export class ClubError extends Error {
  constructor(
    readonly code: ClubErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClubError';
  }
}
