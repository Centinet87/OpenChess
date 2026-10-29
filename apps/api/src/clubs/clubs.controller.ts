import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClubsUseCases, type MemberView, type MyClub } from '@openchess/clubs';
import { ClsService } from 'nestjs-cls';
import { ZodPipe } from '../common/zod.pipe';
import { AuthGuard } from '../identity/auth.guard';
import { ClubMemberGuard } from './club-member.guard';
import {
  acceptInvitationSchema,
  changeRoleSchema,
  createClubSchema,
  inviteSchema,
  type AcceptInvitationInput,
  type CreateClubInput,
  type RoleInput,
} from './clubs.schemas';

/** Dominio raíz: crear clubes y listar los míos. */
@Controller('clubs')
@UseGuards(AuthGuard)
export class ClubsController {
  constructor(
    private readonly clubs: ClubsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Post()
  create(
    @Body(new ZodPipe(createClubSchema)) body: CreateClubInput,
  ): Promise<{ id: string; slug: string }> {
    return this.clubs.createClub(this.cls.get('userId'), body);
  }

  @Get('mine')
  mine(): Promise<MyClub[]> {
    return this.clubs.listMyClubs(this.cls.get('userId'));
  }
}

/** Subdominio de un club: solo para sus miembros. */
@Controller('club')
@UseGuards(AuthGuard, ClubMemberGuard)
export class ClubController {
  constructor(
    private readonly clubs: ClubsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Get('members')
  members(): Promise<MemberView[]> {
    return this.clubs.listMembers(this.cls.get('clubId'));
  }

  @Patch('members/:userId')
  @HttpCode(204)
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(changeRoleSchema)) body: RoleInput,
  ): Promise<void> {
    return this.clubs.changeRole(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      userId,
      body.role,
    );
  }

  @Delete('members/:userId')
  @HttpCode(204)
  remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.clubs.removeMember(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      userId,
    );
  }

  @Post('invitations')
  invite(
    @Body(new ZodPipe(inviteSchema)) body: RoleInput,
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.clubs.invite(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body.role,
    );
  }
}

/** Aceptar una invitación: hay que tener cuenta, pero todavía no ser miembro. */
@Controller('club/invitations/accept')
@UseGuards(AuthGuard)
export class AcceptInvitationController {
  constructor(
    private readonly clubs: ClubsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Post()
  @HttpCode(200)
  accept(
    @Body(new ZodPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
  ): Promise<{ role: string }> {
    const clubId = this.cls.get<string | undefined>('requestedClubId');
    if (!clubId) throw new NotFoundException('Club no encontrado');
    // Única ruta que abre el contexto del club sin ser miembro: el token es la autorización,
    // y RLS sigue limitando la búsqueda a las invitaciones de este club.
    this.cls.set('clubId', clubId);
    return this.clubs.acceptInvitation(
      clubId,
      this.cls.get('userId'),
      body.token,
    );
  }
}
