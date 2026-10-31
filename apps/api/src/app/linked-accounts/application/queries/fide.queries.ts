export class GetFideQuery {
  constructor(
    readonly clubId: string,
    readonly memberId: string,
  ) {}
}

export class ListFideQuery {
  constructor(readonly clubId: string) {}
}
