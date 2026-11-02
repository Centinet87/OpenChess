import type {
  FideView,
  ImportedGameView,
  LinkedAccountView,
  OwnLinkedAccountView,
} from '@openchess/contracts';
import type { ImportedGameSnapshot } from '../../domain/entities/external-game';
import type { FideLinkSnapshot } from '../../domain/entities/fide';
import type { LinkedAccountSnapshot } from '../../domain/entities/linked-account';
import type { Platform } from '../../domain/entities/platform';

const PROFILE_URL: Record<Platform, (displayName: string) => string> = {
  lichess: (name) => `https://lichess.org/@/${name}`,
  chesscom: (name) => `https://www.chess.com/member/${name}`,
};

export function toAccountView(a: LinkedAccountSnapshot): LinkedAccountView {
  return {
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
    url: PROFILE_URL[a.platform](a.displayName),
    verified: a.verifiedAt !== null,
    ratings: a.ratings,
    ratingsUpdatedAt: a.ratingsUpdatedAt?.toISOString() ?? null,
  };
}

export function toOwnAccountView(
  a: LinkedAccountSnapshot,
): OwnLinkedAccountView {
  return { ...toAccountView(a), verificationCode: a.verificationCode };
}

export function toGameView(g: ImportedGameSnapshot): ImportedGameView {
  return {
    id: g.id,
    platform: g.platform,
    url: g.url,
    whiteName: g.whiteName,
    blackName: g.blackName,
    whiteUserId: g.whiteUserId,
    blackUserId: g.blackUserId,
    result: g.result,
    speed: g.speed,
    standard: g.standard,
    playedAt: g.playedAt.toISOString(),
  };
}

export function toFideView(f: FideLinkSnapshot): FideView {
  return {
    userId: f.userId,
    fideId: f.fideId,
    name: f.name,
    federation: f.federation,
    title: f.title,
    ratings: f.ratings,
    url: `https://ratings.fide.com/profile/${f.fideId}`,
    ratingsUpdatedAt: f.ratingsUpdatedAt.toISOString(),
  };
}
