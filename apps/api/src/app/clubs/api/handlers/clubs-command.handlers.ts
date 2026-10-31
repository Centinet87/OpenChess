import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  AcceptClubInvitationCommand,
  ChangeClubMemberRoleCommand,
  CreateClubCommand,
  CreateClubRoleCommand,
  DeleteClubRoleCommand,
  InviteClubMemberCommand,
  RemoveClubMemberCommand,
  ReorderClubRolesCommand,
  UpdateClubRoleCommand,
} from '../../application/commands/clubs.commands';
import { ClubsUseCases } from '../../application/use-cases/clubs.use-cases';

@CommandHandler(CreateClubCommand)
export class CreateClubHandler implements ICommandHandler<
  CreateClubCommand,
  Awaited<ReturnType<ClubsUseCases['createClub']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: CreateClubCommand) {
    return this.useCase.createClub(message.userId, message.input);
  }
}

@CommandHandler(CreateClubRoleCommand)
export class CreateClubRoleHandler implements ICommandHandler<
  CreateClubRoleCommand,
  Awaited<ReturnType<ClubsUseCases['createRole']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: CreateClubRoleCommand) {
    return this.useCase.createRole(
      message.clubId,
      message.actorId,
      message.input,
    );
  }
}

@CommandHandler(UpdateClubRoleCommand)
export class UpdateClubRoleHandler implements ICommandHandler<
  UpdateClubRoleCommand,
  Awaited<ReturnType<ClubsUseCases['updateRole']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: UpdateClubRoleCommand) {
    return this.useCase.updateRole(
      message.clubId,
      message.actorId,
      message.roleId,
      message.input,
    );
  }
}

@CommandHandler(DeleteClubRoleCommand)
export class DeleteClubRoleHandler implements ICommandHandler<
  DeleteClubRoleCommand,
  Awaited<ReturnType<ClubsUseCases['deleteRole']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: DeleteClubRoleCommand) {
    return this.useCase.deleteRole(
      message.clubId,
      message.actorId,
      message.roleId,
    );
  }
}

@CommandHandler(ReorderClubRolesCommand)
export class ReorderClubRolesHandler implements ICommandHandler<
  ReorderClubRolesCommand,
  Awaited<ReturnType<ClubsUseCases['reorderRoles']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: ReorderClubRolesCommand) {
    return this.useCase.reorderRoles(
      message.clubId,
      message.actorId,
      message.roleIds,
    );
  }
}

@CommandHandler(InviteClubMemberCommand)
export class InviteClubMemberHandler implements ICommandHandler<
  InviteClubMemberCommand,
  Awaited<ReturnType<ClubsUseCases['invite']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: InviteClubMemberCommand) {
    return this.useCase.invite(
      message.clubId,
      message.inviterId,
      message.roleId,
    );
  }
}

@CommandHandler(AcceptClubInvitationCommand)
export class AcceptClubInvitationHandler implements ICommandHandler<
  AcceptClubInvitationCommand,
  Awaited<ReturnType<ClubsUseCases['acceptInvitation']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: AcceptClubInvitationCommand) {
    return this.useCase.acceptInvitation(
      message.clubId,
      message.userId,
      message.token,
    );
  }
}

@CommandHandler(ChangeClubMemberRoleCommand)
export class ChangeClubMemberRoleHandler implements ICommandHandler<
  ChangeClubMemberRoleCommand,
  Awaited<ReturnType<ClubsUseCases['changeMemberRole']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: ChangeClubMemberRoleCommand) {
    return this.useCase.changeMemberRole(
      message.clubId,
      message.actorId,
      message.targetId,
      message.roleId,
    );
  }
}

@CommandHandler(RemoveClubMemberCommand)
export class RemoveClubMemberHandler implements ICommandHandler<
  RemoveClubMemberCommand,
  Awaited<ReturnType<ClubsUseCases['removeMember']>>
> {
  constructor(private readonly useCase: ClubsUseCases) {}
  execute(message: RemoveClubMemberCommand) {
    return this.useCase.removeMember(
      message.clubId,
      message.actorId,
      message.targetId,
    );
  }
}

export const CLUBS_COMMAND_HANDLERS = [
  CreateClubHandler,
  CreateClubRoleHandler,
  UpdateClubRoleHandler,
  DeleteClubRoleHandler,
  ReorderClubRolesHandler,
  InviteClubMemberHandler,
  AcceptClubInvitationHandler,
  ChangeClubMemberRoleHandler,
  RemoveClubMemberHandler,
];
