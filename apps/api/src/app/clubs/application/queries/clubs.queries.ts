export class ListMyClubsQuery {
  constructor(readonly userId: string) {}
}

export class ListClubMembersQuery {
  constructor(readonly clubId: string) {}
}

export class ListClubRolesQuery {
  constructor(readonly clubId: string) {}
}

export class GetMyClubRoleQuery {
  constructor(
    readonly clubId: string,
    readonly userId: string,
  ) {}
}
