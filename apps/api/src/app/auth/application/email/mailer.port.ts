export interface Email {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Envía emails. Lanza si el proveedor no lo acepta. */
export interface Mailer {
  send(email: Email): Promise<void>;
}

export const MAILER = Symbol('MAILER');
