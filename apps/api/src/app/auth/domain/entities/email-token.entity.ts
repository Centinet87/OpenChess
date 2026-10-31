export type EmailTokenPurpose =
  'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'CHANGE_EMAIL';

export interface EmailAccount {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
}
