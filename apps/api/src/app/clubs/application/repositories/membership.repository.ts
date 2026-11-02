import type { RoleGrant } from '../../domain/entities/role';

export abstract class MembershipRepository {
  abstract role(clubId: string, userId: string): Promise<RoleGrant | null>;
  abstract clubId(slug: string, userId: string): Promise<string | null>;
  abstract exists(clubId: string, userId: string): Promise<boolean>;
}
