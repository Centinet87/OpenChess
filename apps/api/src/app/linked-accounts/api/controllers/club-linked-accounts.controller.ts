import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ClubMemberGuard } from '../../../clubs/api/guards/club-member.guard';
import {
  PermissionGuard,
  RequirePermission,
} from '../../../clubs/api/guards/permission.guard';
import { perIpAndUser } from '../../../common/throttler.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import { ImportGamesCommand } from '../../application/commands/linked-accounts.commands';
import {
  GetImportedGameQuery,
  GetVerifiedAccountsQuery,
  ListImportedGamesQuery,
} from '../../application/queries/linked-accounts.queries';
import type { ImportedGameSnapshot } from '../../domain/entities/external-game';
import type { LinkedAccountSnapshot } from '../../domain/entities/linked-account';
import {
  importSchema,
  listImportsSchema,
  type ImportedGameDetail,
  type ImportedGameView,
  type ImportInput,
  type ImportSummary,
  type LinkedAccountView,
} from '../dtos/linked-accounts.dto';
import { toAccountView, toGameView } from '../presenters/linked-accounts.view';

// Cada uno pega en la plataforma externa: no más de 5 por minuto, por IP y por usuario.
const EXTERNAL = perIpAndUser(5);

/** Dentro de un club: cuentas de los miembros y partidas importadas. */
@Controller('club')
@UseGuards(AuthGuard, ClubMemberGuard, PermissionGuard)
export class ClubLinkedAccountsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  /** Cuentas verificadas de un miembro. RLS no deja ver las de quien no es del club. */
  @Get('accounts/:userId')
  async memberAccounts(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<LinkedAccountView[]> {
    const rows = await this.queries.execute<
      GetVerifiedAccountsQuery,
      LinkedAccountSnapshot[]
    >(new GetVerifiedAccountsQuery(userId));
    return rows.map(toAccountView);
  }

  /** Trae al club mis partidas recientes de la plataforma. */
  @Post('imports')
  @Throttle(EXTERNAL)
  @RequirePermission('IMPORT_GAMES')
  importGames(
    @Body(new ZodPipe(importSchema)) body: ImportInput,
  ): Promise<ImportSummary> {
    return this.commands.execute<ImportGamesCommand, ImportSummary>(
      new ImportGamesCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        body.platform,
      ),
    );
  }

  @Get('imports')
  async listImports(
    @Query(new ZodPipe(listImportsSchema)) query: { userId?: string },
  ): Promise<ImportedGameView[]> {
    const rows = await this.queries.execute<
      ListImportedGamesQuery,
      ImportedGameSnapshot[]
    >(new ListImportedGamesQuery(this.cls.get('clubId'), query.userId ?? null));
    return rows.map(toGameView);
  }

  @Get('imports/:id')
  async getImport(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ImportedGameDetail> {
    const game = await this.queries.execute<
      GetImportedGameQuery,
      ImportedGameSnapshot | null
    >(new GetImportedGameQuery(this.cls.get('clubId'), id));
    if (!game) throw new NotFoundException('Partida no encontrada');
    return { ...toGameView(game), pgn: game.pgn };
  }
}
