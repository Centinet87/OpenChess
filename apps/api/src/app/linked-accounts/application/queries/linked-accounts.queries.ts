export class ListLinkedAccountsQuery {
  constructor(readonly userId: string) {}
}

export class GetVerifiedAccountsQuery {
  constructor(readonly userId: string) {}
}

export class ListImportedGamesQuery {
  constructor(
    readonly clubId: string,
    readonly userId: string | null,
  ) {}
}

export class GetImportedGameQuery {
  constructor(
    readonly clubId: string,
    readonly id: string,
  ) {}
}
