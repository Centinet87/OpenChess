export interface AccountData {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  linkedAccounts: {
    platform: string;
    username: string;
    displayName: string;
    verifiedAt: string | null;
    ratings: unknown;
  }[];
  clubs: {
    club: { slug: string; name: string };
    role: string;
    joinedAt: string;
    rating: {
      rating: number;
      deviation: number;
      games: number;
      wins: number;
      draws: number;
      losses: number;
    } | null;
    ratingHistory: {
      gameId: string;
      opponent: string;
      score: number;
      ratingBefore: number;
      ratingAfter: number;
      at: string;
    }[];
    fide: {
      fideId: string;
      name: string;
      federation: string | null;
      title: string | null;
      ratings: unknown;
    } | null;
    games: {
      id: string;
      color: 'white' | 'black';
      opponent: string;
      status: string;
      result: string | null;
      termination: string | null;
      timeControl: { kind: string; initialMs: number; incrementMs: number };
      pgn: string;
      playedAt: string;
    }[];
    importedGames: {
      platform: string;
      url: string;
      white: string;
      black: string;
      result: string | null;
      speed: string;
      pgn: string;
      playedAt: string;
    }[];
  }[];
}
