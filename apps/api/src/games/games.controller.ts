import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  challengeSchema,
  listGamesSchema,
  type ChallengeInput,
  type GameStatus,
  type GameView,
} from '@openchess/contracts';
import { GamesUseCases } from '@openchess/games';
import { ClsService } from 'nestjs-cls';
import { ClubMemberGuard } from '../clubs/club-member.guard';
import { PermissionGuard, RequirePermission } from '../clubs/permission.guard';
import { ZodPipe } from '../app/common/zod.pipe';
import { AuthGuard } from '../app/auth/infrastructure/http/auth.guard';
import { toView } from './game-view';

/**
 * Desafíos y consulta de partidas por HTTP. Las jugadas van por WebSocket
 * (GamesGateway) para que lleguen a los dos jugadores al instante.
 */
@Controller('club/games')
@UseGuards(AuthGuard, ClubMemberGuard, PermissionGuard)
export class GamesController {
  constructor(
    private readonly games: GamesUseCases,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @RequirePermission('PLAY_GAMES')
  async challenge(
    @Body(new ZodPipe(challengeSchema)) body: ChallengeInput,
  ): Promise<GameView> {
    const game = await this.games.challenge(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body,
    );
    return toView(game, Date.now());
  }

  @Get()
  async list(
    @Query(new ZodPipe(listGamesSchema))
    query: {
      status: GameStatus[];
    },
  ): Promise<GameView[]> {
    const now = Date.now();
    const games = await this.games.list(this.cls.get('clubId'), query.status);
    return games.map((g) => toView(g, now));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    // Si el reloj ya venció, se cierra antes de mostrarla.
    return toView(await this.games.checkTimeout(id), Date.now());
  }

  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermission('PLAY_GAMES')
  async accept(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    return toView(
      await this.games.accept(id, this.cls.get('userId')),
      Date.now(),
    );
  }

  @Post(':id/decline')
  @HttpCode(200)
  async decline(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    return toView(
      await this.games.decline(id, this.cls.get('userId')),
      Date.now(),
    );
  }
}
