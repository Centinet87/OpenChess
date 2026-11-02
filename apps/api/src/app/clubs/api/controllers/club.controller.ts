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
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../../../auth/api/guards/auth.guard';
import { ZodPipe } from '../../../common/zod.pipe';
import {
  ChangeClubMemberRoleCommand,
  InviteClubMemberCommand,
  RemoveClubMemberCommand,
} from '../../application/commands/clubs.commands';
import {
  GetMyClubRoleQuery,
  ListClubMembersQuery,
} from '../../application/queries/clubs.queries';
import type { ClubRole } from '../../domain/entities/role';
import {
  roleIdSchema,
  type InvitationView,
  type MemberView,
  type RoleIdInput,
  type RoleView,
} from '../dtos/clubs.dto';
import { ClubMemberGuard } from '../guards/club-member.guard';

/** Subdominio de un club: solo para sus miembros. */
@Controller('club')
@UseGuards(AuthGuard, ClubMemberGuard)
export class ClubController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
    private readonly cls: ClsService,
  ) {}

  @Get('members')
  members(): Promise<MemberView[]> {
    return this.queries.execute<ListClubMembersQuery, MemberView[]>(
      new ListClubMembersQuery(this.cls.get('clubId')),
    );
  }

  /** Mi rol y mis permisos en este club: el front lo usa para saber qué mostrar. */
  @Get('me')
  me(): Promise<RoleView> {
    return this.queries.execute<GetMyClubRoleQuery, ClubRole>(
      new GetMyClubRoleQuery(this.cls.get('clubId'), this.cls.get('userId')),
    );
  }

  @Patch('members/:userId')
  @HttpCode(204)
  changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodPipe(roleIdSchema)) body: RoleIdInput,
  ): Promise<void> {
    return this.commands.execute<ChangeClubMemberRoleCommand, void>(
      new ChangeClubMemberRoleCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        userId,
        body.roleId,
      ),
    );
  }

  @Delete('members/:userId')
  @HttpCode(204)
  remove(@Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.commands.execute<RemoveClubMemberCommand, void>(
      new RemoveClubMemberCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        userId,
      ),
    );
  }

  @Post('invitations')
  async invite(
    @Body(new ZodPipe(roleIdSchema)) body: RoleIdInput,
  ): Promise<InvitationView> {
    const { token, expiresAt } = await this.commands.execute<
      InviteClubMemberCommand,
      { token: string; expiresAt: Date }
    >(
      new InviteClubMemberCommand(
        this.cls.get('clubId'),
        this.cls.get('userId'),
        body.roleId,
      ),
    );
    return { token, expiresAt: expiresAt.toISOString() };
  }
}
