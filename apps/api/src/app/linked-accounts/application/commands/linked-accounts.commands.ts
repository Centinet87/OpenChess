import type { Platform } from '../../domain/entities/platform';

export class LinkVerifiedAccountCommand {
  constructor(
    readonly userId: string,
    readonly platform: Platform,
    readonly username: string,
  ) {}
}

export class StartAccountVerificationCommand {
  constructor(
    readonly userId: string,
    readonly platform: Platform,
    readonly username: string,
  ) {}
}

export class VerifyLinkedAccountCommand {
  constructor(
    readonly userId: string,
    readonly platform: Platform,
  ) {}
}

export class UnlinkAccountCommand {
  constructor(
    readonly userId: string,
    readonly platform: Platform,
  ) {}
}

export class RefreshLinkedAccountCommand {
  constructor(
    readonly userId: string,
    readonly platform: Platform,
  ) {}
}

export class ImportGamesCommand {
  constructor(
    readonly clubId: string,
    readonly userId: string,
    readonly platform: Platform,
  ) {}
}
