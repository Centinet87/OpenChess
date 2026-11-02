import { AuthError } from '../../domain/auth.error';
import type { ChangePasswordInput, Session } from '../../domain/auth.types';
import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';
import { IssueSession } from './issue-session';

export class ChangePasswordUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
    private readonly issueSession: IssueSession,
  ) {}

  async execute(userId: string, input: ChangePasswordInput): Promise<Session> {
    const user = await this.repository.findUserCredentials(userId);
    if (
      !user ||
      !(await this.crypto.verifyPassword(
        user.passwordHash,
        input.currentPassword,
      ))
    ) {
      throw new AuthError('invalid_credentials', 'Contraseña incorrecta');
    }
    await this.repository.changePassword(
      userId,
      await this.crypto.hashPassword(input.newPassword),
    );
    return this.issueSession.execute(userId);
  }
}
