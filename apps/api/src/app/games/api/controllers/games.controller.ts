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
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ClubMemberGuard } from '../../../clubs/api/guards/club-member.guard';
import {
  PermissionGuard,
  RequirePermission,
} from '../../../clubs/api/guards/permission.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import {
  AcceptGameCommand,
  ChallengeGameCommand,
  CheckGameTimeoutCommand,
  DeclineGameCommand,
} from '../../application/commands/games.commands';
import { ListGamesQuery } from '../../application/queries/games.queries';
import type { GameSnapshot } from '../../domain/entities/game';
import {
  challengeSchema,
  listGamesSchema,
  type ChallengeInput,
  type GameStatus,
  type GameView,
} from '../dtos/games.dto';
import { toView } from '../presenters/game-view';

/**
 * Desafíos y consulta de partidas por HTTP. Las jugadas van por WebSocket
 * (GamesGateway) para que lleguen a los dos jugadores al instante.
 */
@Controller('club/games')
@UseGuards(AuthGuard, ClubMemberGuard, PermissionGuard)
export class GamesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @RequirePermission('PLAY_GAMES')
  async challenge(
    @Body(new ZodPipe(challengeSchema)) body: ChallengeInput,
  ): Promise<GameView> {
    const game = await this.commands.execute<
      ChallengeGameCommand,
      GameSnapshot
    >(
      new ChallengeGameCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        body,
      ),
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
    const games = await this.queries.execute<ListGamesQuery, GameSnapshot[]>(
      new ListGamesQuery(this.cls.get('clubId'), query.status),
    );
    return games.map((g) => toView(g, now));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    // Si el reloj ya venció, se cierra antes de mostrarla.
    return toView(
      await this.commands.execute<CheckGameTimeoutCommand, GameSnapshot>(
        new CheckGameTimeoutCommand(id),
      ),
      Date.now(),
    );
  }

  @Post(':id/accept')
  @HttpCode(200)
  @RequirePermission('PLAY_GAMES')
  async accept(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    return toView(
      await this.commands.execute<AcceptGameCommand, GameSnapshot>(
        new AcceptGameCommand(id, this.cls.get('userId')),
      ),
      Date.now(),
    );
  }

  @Post(':id/decline')
  @HttpCode(200)
  async decline(@Param('id', ParseUUIDPipe) id: string): Promise<GameView> {
    return toView(
      await this.commands.execute<DeclineGameCommand, GameSnapshot>(
        new DeclineGameCommand(id, this.cls.get('userId')),
      ),
      Date.now(),
    );
  }
}
