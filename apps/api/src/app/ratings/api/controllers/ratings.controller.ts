import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ClubMemberGuard } from '../../../clubs/api/guards/club-member.guard';
import {
  GetRatingProfileQuery,
  GetStandingsQuery,
} from '../../application/queries/ratings.queries';
import type { Standing } from '../../application/repositories/ratings.ports';
import type { PlayerProfile } from '../../application/use-cases/ratings.use-cases';
import { type PlayerRatingSnapshot } from '../../domain/entities/player-rating';
import { isProvisional } from '../../domain/entities/rating';
import type {
  ProfileView,
  RatingView,
  StandingView,
} from '../dtos/ratings.dto';

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
    private readonly queries: QueryBus,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async standings(): Promise<StandingView[]> {
    const rows = await this.queries.execute<GetStandingsQuery, Standing[]>(
      new GetStandingsQuery(this.cls.get('clubId')),
    );
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
    const profile = await this.queries.execute<
      GetRatingProfileQuery,
      PlayerProfile | null
    >(new GetRatingProfileQuery(this.cls.get('clubId'), userId));
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
