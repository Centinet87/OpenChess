import type { MoveInput } from '../../domain/entities/game';
import type { ColorChoice } from '../use-cases/games.use-cases';

export class ChallengeGameCommand {
  constructor(
    readonly clubId: string,
    readonly challengerId: string,
    readonly input: {
      opponentId: string;
      timeControl: string;
      color: ColorChoice;
    },
  ) {}
}

export class AcceptGameCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class DeclineGameCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class MoveGameCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
    readonly move: MoveInput,
  ) {}
}

export class ResignGameCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class AbortGameCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class OfferGameDrawCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class AcceptGameDrawCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class DeclineGameDrawCommand {
  constructor(
    readonly gameId: string,
    readonly userId: string,
  ) {}
}

export class CheckGameTimeoutCommand {
  constructor(readonly gameId: string) {}
}
