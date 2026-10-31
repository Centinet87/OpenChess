export class GetMembershipRoleQuery {
  constructor(
    readonly clubId: string,
    readonly userId: string,
  ) {}
}

export class GetMembershipClubQuery {
  constructor(
    readonly slug: string,
    readonly userId: string,
  ) {}
}

export class IsClubMemberQuery {
  constructor(
    readonly clubId: string,
    readonly userId: string,
  ) {}
}
