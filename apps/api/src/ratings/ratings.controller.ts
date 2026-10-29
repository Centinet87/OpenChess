import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type {
  ProfileView,
  RatingView,
  StandingView,
} from '@openchess/contracts';
import {
  isProvisional,
  RatingsUseCases,
  type PlayerRatingSnapshot,
} from '@openchess/ratings';
import { ClsService } from 'nestjs-cls';
import { ClubMemberGuard } from '../clubs/club-member.guard';
import { AuthGuard } from '../identity/auth.guard';

function toView(s: PlayerRatingSnapshot): RatingView {
  return {
    userId: s.userId,
    rating: Math.round(s.rating.rating),
    deviation: Math.round(s.rating.deviation),
    provisional: isProvisional(s.rating),
    games: s.games,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
  };
}

/** Tabla de posiciones y perfil de rating de cada jugador del club. */
@Controller('club/ratings')
@UseGuards(AuthGuard, ClubMemberGuard)
export class RatingsController {
  constructor(
    private readonly ratings: RatingsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async standings(): Promise<StandingView[]> {
    const rows = await this.ratings.standings(this.cls.get('clubId'));
    return rows.map((row, i) => ({
      position: i + 1,
      displayName: row.displayName,
      ...toView(row),
    }));
  }

  @Get(':userId')
  async profile(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ProfileView> {
    const profile = await this.ratings.profile(this.cls.get('clubId'), userId);
    if (!profile) throw new NotFoundException('No es miembro de este club');
    return {
      ...toView(profile.rating),
      history: profile.history.map((h) => ({
        gameId: h.gameId,
        opponentId: h.opponentId,
        score: h.score,
        ratingBefore: Math.round(h.ratingBefore),
        ratingAfter: Math.round(h.ratingAfter),
        playedAt: h.playedAt.toISOString(),
      })),
    };
  }
}
