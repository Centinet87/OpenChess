export type LinkErrorCode =
  | 'INVALID_USERNAME'
  | 'ACCOUNT_NOT_FOUND'
  | 'ALREADY_LINKED'
  | 'NOT_PENDING'
  | 'CODE_NOT_FOUND'
  | 'NOT_LINKED'
  | 'PLATFORM_UNAVAILABLE'
  | 'FORBIDDEN'
  | 'NOT_MEMBER'
  | 'INVALID_FIDE_ID';

/** Regla de negocio rota. La API traduce el código a un status HTTP. */
export class LinkError extends Error {
  constructor(
    readonly code: LinkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LinkError';
  }
}
