import type { FideAdmin } from '../use-cases/fide.use-cases';

export class LinkFideCommand {
  constructor(
    readonly clubId: string,
    readonly admin: FideAdmin,
    readonly memberId: string,
    readonly fideId: string,
  ) {}
}

export class UnlinkFideCommand {
  constructor(
    readonly clubId: string,
    readonly admin: Pick<FideAdmin, 'canManage'>,
    readonly memberId: string,
  ) {}
}

export class RefreshFideCommand {
  constructor(
    readonly clubId: string,
    readonly memberId: string,
  ) {}
}
