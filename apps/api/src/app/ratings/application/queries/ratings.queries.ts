export class GetStandingsQuery {
  constructor(readonly clubId: string) {}
}

export class GetRatingProfileQuery {
  constructor(
    readonly clubId: string,
    readonly userId: string,
  ) {}
}
