export type BillingErrorCode =
  'FORBIDDEN' | 'ALREADY_SUBSCRIBED' | 'NOT_SUBSCRIBED' | 'BILLING_UNAVAILABLE';

/** Regla de negocio rota. La API traduce el código a un status HTTP. */
export class BillingError extends Error {
  constructor(
    readonly code: BillingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}
