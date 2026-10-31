import type { AccountData } from '../../domain/entities/account-data.entity';

export interface AccountMembership {
  clubId: string;
  role: { isOwner: boolean };
  club: { slug: string; name: string };
}

export abstract class AccountRepository {
  abstract export(userId: string): Promise<AccountData | null>;
  abstract passwordHash(userId: string): Promise<string | null>;
  abstract memberships(userId: string): Promise<AccountMembership[]>;
  abstract activeGames(userId: string, clubId: string): Promise<number>;
  abstract owners(userId: string, clubId: string): Promise<number>;
  abstract members(userId: string, clubId: string): Promise<number>;
  abstract payingSubscriptions(userId: string, clubId: string): Promise<number>;
  abstract leave(
    userId: string,
    clubId: string,
    deleteClub: boolean,
    slug: string,
  ): Promise<void>;
  abstract anonymize(
    userId: string,
    email: string,
    displayName: string,
  ): Promise<void>;
}
