import type { AccountData } from '../../domain/entities/account-data.entity';

export abstract class AccountOperations {
  abstract export(userId: string): Promise<AccountData>;
  abstract delete(userId: string, password: string): Promise<void>;
}

export abstract class AccountEmailOperations {
  abstract queueVerification(userId: string): void;
  abstract verifyEmail(token: string): Promise<void>;
  abstract requestPasswordReset(email: string): void;
  abstract resetPassword(token: string, password: string): Promise<void>;
  abstract requestEmailChange(
    userId: string,
    password: string,
    newEmail: string,
  ): Promise<void>;
  abstract confirmEmailChange(token: string): Promise<void>;
  abstract queuePasswordChanged(userId: string): void;
}
