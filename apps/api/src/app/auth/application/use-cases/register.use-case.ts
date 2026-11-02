import { AuthError } from '../../domain/auth.error';
import type { Registration } from '../../domain/auth.types';
import type { RegisterInput } from '../commands/auth.commands';
import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';
import { IssueSession } from './issue-session';

export class RegisterUseCase {
  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
    private readonly issueSession: IssueSession,
  ) {}

  async execute(input: RegisterInput): Promise<Registration> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing)
      throw new AuthError('email_taken', 'Ya existe una cuenta con ese email');
    const user = await this.repository.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash: await this.crypto.hashPassword(input.password),
    });
    return {
      session: await this.issueSession.execute(user.id),
      userId: user.id,
    };
  }
}
