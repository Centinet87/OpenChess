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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ClubsUseCases, PERMISSIONS } from '@openchess/clubs';
import {
  acceptInvitationSchema,
  createClubSchema,
  createRoleSchema,
  reorderRolesSchema,
  roleIdSchema,
  updateRoleSchema,
  type AcceptedInvitation,
  type AcceptInvitationInput,
  type CreateClubInput,
  type CreatedClub,
  type CreateRoleInput,
  type InvitationView,
  type MemberView,
  type MyClubView,
  type Permission,
  type ReorderRolesInput,
  type RoleIdInput,
  type RoleView,
  type UpdateRoleInput,
} from '@openchess/contracts';
import { ClsService } from 'nestjs-cls';
import { ZodPipe } from '../common/zod.pipe';
import { AuthGuard } from '../identity/auth.guard';
import { ClubMemberGuard } from './club-member.guard';

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
  ): Promise<CreatedClub> {
    return this.clubs.createClub(this.cls.get('userId'), body);
  }

  @Get('mine')
  mine(): Promise<MyClubView[]> {
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

  /** Mi rol y mis permisos en este club: el front lo usa para saber qué mostrar. */
  @Get('me')
  me(): Promise<RoleView> {
    return this.clubs.myRole(this.cls.get('clubId'), this.cls.get('userId'));
  }

  @Patch('members/:userId')
  @HttpCode(204)
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(roleIdSchema)) body: RoleIdInput,
  ): Promise<void> {
    return this.clubs.changeMemberRole(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      userId,
      body.roleId,
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
  async invite(
    @Body(new ZodPipe(roleIdSchema)) body: RoleIdInput,
  ): Promise<InvitationView> {
    const { token, expiresAt } = await this.clubs.invite(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body.roleId,
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }
}

/**
 * Roles del club: cada club crea los suyos, con permisos, orden y color. Las
 * reglas (permiso MANAGE_ROLES, jerarquía) las aplica el dominio.
 */
@Controller('club/roles')
@UseGuards(AuthGuard, ClubMemberGuard)
export class RolesController {
  constructor(
    private readonly clubs: ClubsUseCases,
    private readonly cls: ClsService,
  ) {}

  @Get()
  list(): Promise<readonly RoleView[]> {
    return this.clubs.listRoles(this.cls.get('clubId'));
  }

  /** Los permisos que se pueden marcar en un rol. */
  @Get('permissions')
  permissions(): readonly Permission[] {
    return PERMISSIONS;
  }

  @Post()
  create(
    @Body(new ZodPipe(createRoleSchema)) body: CreateRoleInput,
  ): Promise<RoleView> {
    return this.clubs.createRole(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body,
    );
  }

  /** Orden nuevo de la jerarquía, de arriba abajo, sin el rol dueño. */
  @Put('order')
  reorder(
    @Body(new ZodPipe(reorderRolesSchema)) body: ReorderRolesInput,
  ): Promise<readonly RoleView[]> {
    return this.clubs.reorderRoles(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      body.roleIds,
    );
  }

  @Patch(':roleId')
  update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body(new ZodPipe(updateRoleSchema)) body: UpdateRoleInput,
  ): Promise<RoleView> {
    return this.clubs.updateRole(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      roleId,
      body,
    );
  }

  @Delete(':roleId')
  @HttpCode(204)
  remove(@Param('roleId', ParseUUIDPipe) roleId: string): Promise<void> {
    return this.clubs.deleteRole(
      this.cls.get('clubId'),
      this.cls.get('userId'),
      roleId,
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
  ): Promise<AcceptedInvitation> {
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
