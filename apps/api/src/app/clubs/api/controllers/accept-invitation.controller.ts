import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import { AcceptClubInvitationCommand } from '../../application/commands/clubs.commands';
import type { RoleSummary } from '../../application/repositories/clubs.ports';
import {
  acceptInvitationSchema,
  type AcceptedInvitation,
  type AcceptInvitationInput,
} from '../dtos/clubs.dto';

/** Aceptar una invitación: hay que tener cuenta, pero todavía no ser miembro. */
@Controller('club/invitations/accept')
@UseGuards(AuthGuard)
export class AcceptInvitationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @HttpCode(200)
  accept(
    @Body(new ZodPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
  ): Promise<AcceptedInvitation> {
    const clubId = this.cls.get<string | undefined>('requestedClubId');
    if (!clubId) throw new NotFoundException('Club no encontrado');
    // Única ruta que abre el contexto del club sin ser miembro: el token es la autorización,
    // y RLS sigue limitando la búsqueda a las invitaciones de este club.
    this.cls.set('clubId', clubId);
    return this.commands.execute<
      AcceptClubInvitationCommand,
      { role: RoleSummary }
    >(
      new AcceptClubInvitationCommand(
        clubId,
        this.cls.get('userId'),
        body.token,
      ),
    );
  }
}
