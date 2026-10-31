import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ClubMemberGuard } from '../../../clubs/api/guards/club-member.guard';
import { hasPermission } from '../../../clubs/domain/entities/role';
import { perIpAndUser } from '../../../common/throttler.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import {
  LinkFideCommand,
  RefreshFideCommand,
  UnlinkFideCommand,
} from '../../application/commands/fide.commands';
import {
  GetFideQuery,
  ListFideQuery,
} from '../../application/queries/fide.queries';
import type { FideLinkSnapshot } from '../../domain/entities/fide';
import {
  fideIdSchema,
  type FideIdInput,
  type FideView,
} from '../dtos/linked-accounts.dto';
import { toFideView } from '../presenters/linked-accounts.view';

// Cada uno pega en la plataforma externa: no más de 5 por minuto, por IP y por usuario.
const EXTERNAL = perIpAndUser(5);

// Quien gestiona FIDE puede asignar el de toda una academia de una vez.
const FIDE_ADMIN = perIpAndUser(30);

/**
 * Elo FIDE de los miembros. Lo asigna quien tiene el permiso MANAGE_FIDE (FIDE no
 * tiene login para que la persona pruebe que el FIDE ID es suyo); cualquier
 * miembro lo puede ver.
 */
@Controller('club/fide')
@UseGuards(AuthGuard, ClubMemberGuard)
export class FideController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async list(): Promise<FideView[]> {
    return (
      await this.queries.execute<ListFideQuery, FideLinkSnapshot[]>(
        new ListFideQuery(this.cls.get('clubId')),
      )
    ).map(toFideView);
  }

  @Get(':userId')
  async get(@Param('userId', ParseUUIDPipe) userId: string): Promise<FideView> {
    const link = await this.queries.execute<
      GetFideQuery,
      FideLinkSnapshot | null
    >(new GetFideQuery(this.cls.get('clubId'), userId));
    if (!link) throw new NotFoundException('Ese miembro no tiene FIDE ID');
    return toFideView(link);
  }

  @Put(':userId')
  @Throttle(FIDE_ADMIN)
  async link(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(fideIdSchema)) body: FideIdInput,
  ): Promise<FideView> {
    return toFideView(
      await this.commands.execute<LinkFideCommand, FideLinkSnapshot>(
        new LinkFideCommand(
          this.cls.get('clubId'),
          {
            userId: this.cls.get('userId'),
            canManage: hasPermission(this.cls.get('role'), 'MANAGE_FIDE'),
          },
          userId,
          body.fideId,
        ),
      ),
    );
  }

  @Post(':userId/refresh')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async refresh(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<FideView> {
    return toFideView(
      await this.commands.execute<RefreshFideCommand, FideLinkSnapshot>(
        new RefreshFideCommand(this.cls.get('clubId'), userId),
      ),
    );
  }

  @Delete(':userId')
  @HttpCode(204)
  async unlink(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.commands.execute<UnlinkFideCommand, void>(
      new UnlinkFideCommand(
        this.cls.get('clubId'),
        { canManage: hasPermission(this.cls.get('role'), 'MANAGE_FIDE') },
        userId,
      ),
    );
  }
}
