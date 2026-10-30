import { AuthError } from '../../domain/auth.error';
import type { Session } from '../../domain/auth.types';
import type { LoginInput } from '../commands/auth.commands';
import type { AuthRepository } from '../repositories/auth.repository';
import type { AuthCrypto } from '../security/auth.crypto';
import { IssueSession } from './issue-session';

export class LoginUseCase {
  private dummyHash = '';

  constructor(
    private readonly repository: AuthRepository,
    private readonly crypto: AuthCrypto,
    private readonly issueSession: IssueSession,
  ) {}

  async initialize(): Promise<void> {
    // El hash alternativo evita distinguir emails inexistentes por su tiempo de respuesta.
    this.dummyHash = await this.crypto.hashPassword(
      this.crypto.generateToken(),
    );
  }

  async execute(input: LoginInput): Promise<Session> {
    const user = await this.repository.findUserByEmail(input.email);
    const ok = await this.crypto.verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      input.password,
    );
    if (!user || !ok)
      throw new AuthError(
        'invalid_credentials',
        'Email o contraseña incorrectos',
      );
    return this.issueSession.execute(user.id);
  }
}
