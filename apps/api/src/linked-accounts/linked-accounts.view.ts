import type {
  FideLinkSnapshot,
  FideRatings,
  ImportedGameSnapshot,
  LinkedAccountSnapshot,
  OnlineRatings,
  Platform,
} from '@openchess/linked-accounts';

export interface LinkedAccountView {
  platform: Platform;
  username: string;
  displayName: string;
  url: string;
  verified: boolean;
  ratings: OnlineRatings;
  ratingsUpdatedAt: string | null;
}

/** La propia lleva además el código, mientras falta verificarla. */
export interface OwnLinkedAccountView extends LinkedAccountView {
  verificationCode: string | null;
}

export interface ImportedGameView {
  id: string;
  platform: Platform;
  url: string;
  whiteName: string;
  blackName: string;
  whiteUserId: string | null;
  blackUserId: string | null;
  result: string | null;
  speed: string;
  standard: boolean;
  playedAt: string;
}

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

export interface FideView {
  userId: string;
  fideId: string;
  name: string;
  federation: string | null;
  title: string | null;
  ratings: FideRatings;
  url: string;
  ratingsUpdatedAt: string;
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
