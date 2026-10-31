import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { perIpAndUser } from '../../../common/throttler.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import {
  RefreshLinkedAccountCommand,
  StartAccountVerificationCommand,
  UnlinkAccountCommand,
  VerifyLinkedAccountCommand,
} from '../../application/commands/linked-accounts.commands';
import { ListLinkedAccountsQuery } from '../../application/queries/linked-accounts.queries';
import type { LinkedAccountSnapshot } from '../../domain/entities/linked-account';
import {
  platformSchema,
  usernameSchema,
  type OwnLinkedAccountView,
  type Platform,
  type UsernameInput,
} from '../dtos/linked-accounts.dto';
import { toOwnAccountView } from '../presenters/linked-accounts.view';

// Cada uno pega en la plataforma externa: no más de 5 por minuto, por IP y por usuario.
const EXTERNAL = perIpAndUser(5);

/** Vincular las cuentas propias de Lichess y Chess.com. Vale en el dominio raíz. */
@Controller('accounts')
@UseGuards(AuthGuard)
export class LinkedAccountsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async list(): Promise<OwnLinkedAccountView[]> {
    const rows = await this.queries.execute<
      ListLinkedAccountsQuery,
      LinkedAccountSnapshot[]
    >(new ListLinkedAccountsQuery(this.cls.get('userId')));
    return rows.map(toOwnAccountView);
  }

  /** Chess.com no permite iniciar sesión: devuelve un código para poner en el perfil. */
  @Post('chesscom')
  @Throttle(EXTERNAL)
  async startChessCom(
    @Body(new ZodPipe(usernameSchema)) body: UsernameInput,
  ): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.commands.execute<
        StartAccountVerificationCommand,
        LinkedAccountSnapshot
      >(
        new StartAccountVerificationCommand(
          this.cls.get('userId'),
          'chesscom',
          body.username,
        ),
      ),
    );
  }

  @Post('chesscom/verify')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async verifyChessCom(): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.commands.execute<
        VerifyLinkedAccountCommand,
        LinkedAccountSnapshot
      >(new VerifyLinkedAccountCommand(this.cls.get('userId'), 'chesscom')),
    );
  }

  @Post(':platform/refresh')
  @HttpCode(200)
  @Throttle(EXTERNAL)
  async refresh(
    @Param('platform', new ZodPipe(platformSchema)) platform: Platform,
  ): Promise<OwnLinkedAccountView> {
    return toOwnAccountView(
      await this.commands.execute<
        RefreshLinkedAccountCommand,
        LinkedAccountSnapshot
      >(new RefreshLinkedAccountCommand(this.cls.get('userId'), platform)),
    );
  }

  @Delete(':platform')
  @HttpCode(204)
  async unlink(
    @Param('platform', new ZodPipe(platformSchema)) platform: Platform,
  ): Promise<void> {
    await this.commands.execute<UnlinkAccountCommand, void>(
      new UnlinkAccountCommand(this.cls.get('userId'), platform),
    );
  }
}
