import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import {
  CreateClubRoleCommand,
  DeleteClubRoleCommand,
  ReorderClubRolesCommand,
  UpdateClubRoleCommand,
} from '../../application/commands/clubs.commands';
import { ListClubRolesQuery } from '../../application/queries/clubs.queries';
import type { ClubRole } from '../../domain/entities/role';
import { PERMISSIONS } from '../../domain/entities/role';
import {
  createRoleSchema,
  reorderRolesSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type Permission,
  type ReorderRolesInput,
  type RoleView,
  type UpdateRoleInput,
} from '../dtos/clubs.dto';
import { ClubMemberGuard } from '../guards/club-member.guard';

/**
 * Roles del club: cada club crea los suyos, con permisos, orden y color. Las
 * reglas (permiso MANAGE_ROLES, jerarquía) las aplica el dominio.
 */
@Controller('club/roles')
@UseGuards(AuthGuard, ClubMemberGuard)
export class RolesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Get()
  list(): Promise<readonly RoleView[]> {
    return this.queries.execute<ListClubRolesQuery, readonly ClubRole[]>(
      new ListClubRolesQuery(this.cls.get('clubId')),
    );
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
    return this.commands.execute<CreateClubRoleCommand, ClubRole>(
      new CreateClubRoleCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        body,
      ),
    );
  }

  /** Orden nuevo de la jerarquía, de arriba abajo, sin el rol dueño. */
  @Put('order')
  reorder(
    @Body(new ZodPipe(reorderRolesSchema)) body: ReorderRolesInput,
  ): Promise<readonly RoleView[]> {
    return this.commands.execute<ReorderClubRolesCommand, readonly ClubRole[]>(
      new ReorderClubRolesCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        body.roleIds,
      ),
    );
  }

  @Patch(':roleId')
  update(
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body(new ZodPipe(updateRoleSchema)) body: UpdateRoleInput,
  ): Promise<RoleView> {
    return this.commands.execute<UpdateClubRoleCommand, ClubRole>(
      new UpdateClubRoleCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        roleId,
        body,
      ),
    );
  }

  @Delete(':roleId')
  @HttpCode(204)
  remove(@Param('roleId', ParseUUIDPipe) roleId: string): Promise<void> {
    return this.commands.execute<DeleteClubRoleCommand, void>(
      new DeleteClubRoleCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        roleId,
      ),
    );
  }
}
