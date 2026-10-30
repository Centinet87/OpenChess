export class GetCurrentUserQuery {
  constructor(readonly userId: string) {}
}

export class VerifyAccessTokenQuery {
  constructor(readonly accessToken: string) {}
}
