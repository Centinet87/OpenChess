import { randomUUID } from 'node:crypto';
import { AccountError } from '../../domain/account.error';
import { AuthError } from '../../domain/auth.error';
import type { AccountData } from '../../domain/entities/account-data.entity';
import type { AccountOperations } from '../repositories/account.operations';
import type {
  AccountMembership,
  AccountRepository,
} from '../repositories/account.repository';
import type { AuthCrypto } from '../security/auth.crypto';

export const DELETED_NAME = 'Cuenta eliminada';
const LAST_OWNER_MESSAGE =
  'Eres el único dueño de algunos clubes: nombra a otro dueño antes de eliminar la cuenta';

export class AccountUseCases implements AccountOperations {
  constructor(
    private readonly repository: AccountRepository,
    private readonly crypto: Pick<AuthCrypto, 'verifyPassword'>,
  ) {}

  async export(userId: string): Promise<AccountData> {
    const data = await this.repository.export(userId);
    if (!data) throw new AuthError('user_not_found');
    return data;
  }

  async delete(userId: string, password: string): Promise<void> {
    const hash = await this.repository.passwordHash(userId);
    if (!hash || !(await this.crypto.verifyPassword(hash, password))) {
      throw new AccountError('incorrect_password', 'Contraseña incorrecta');
    }
    const memberships = await this.repository.memberships(userId);
    const clubsToDelete = await this.checkDeletion(userId, memberships);
    for (const membership of memberships) {
      try {
        await this.repository.leave(
          userId,
          membership.clubId,
          clubsToDelete.includes(membership.clubId),
          membership.club.slug,
        );
      } catch (error) {
        if (!(error instanceof AccountError) || error.code !== 'LAST_OWNER')
          throw error;
        throw new AccountError('LAST_OWNER', LAST_OWNER_MESSAGE, [
          membership.club,
        ]);
      }
    }
    await this.repository.anonymize(
      userId,
      `eliminada-${randomUUID()}@openchess.invalid`,
      DELETED_NAME,
    );
  }

  private async checkDeletion(
    userId: string,
    memberships: AccountMembership[],
  ): Promise<string[]> {
    const clubsToDelete: string[] = [];
    const ownerless: AccountMembership['club'][] = [];
    const paying: AccountMembership['club'][] = [];
    for (const membership of memberships) {
      const clubId = membership.clubId;
      if ((await this.repository.activeGames(userId, clubId)) > 0) {
        throw new AccountError(
          'GAME_IN_PROGRESS',
          'Termina tus partidas en curso antes de eliminar la cuenta',
        );
      }
      if (!membership.role.isOwner) continue;
      const [owners, members] = await Promise.all([
        this.repository.owners(userId, clubId),
        this.repository.members(userId, clubId),
      ]);
      if (owners > 1) continue;
      if (members > 1) {
        ownerless.push(membership.club);
        continue;
      }
      if ((await this.repository.payingSubscriptions(userId, clubId)) > 0)
        paying.push(membership.club);
      else clubsToDelete.push(clubId);
    }
    if (ownerless.length)
      throw new AccountError('LAST_OWNER', LAST_OWNER_MESSAGE, ownerless);
    if (paying.length)
      throw new AccountError(
        'SUBSCRIPTION_ACTIVE',
        'Cancela el plan Pro de tus clubes antes de eliminar la cuenta',
        paying,
      );
    return clubsToDelete;
  }
}
