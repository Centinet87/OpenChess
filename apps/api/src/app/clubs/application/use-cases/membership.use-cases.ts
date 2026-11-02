import type { MembershipRepository } from '../repositories/membership.repository';

export class MembershipUseCases {
  constructor(private readonly memberships: MembershipRepository) {}

  role(clubId: string, userId: string) {
    return this.memberships.role(clubId, userId);
  }

  clubId(slug: string, userId: string) {
    return this.memberships.clubId(slug, userId);
  }

  exists(clubId: string, userId: string) {
    return this.memberships.exists(clubId, userId);
  }
}
