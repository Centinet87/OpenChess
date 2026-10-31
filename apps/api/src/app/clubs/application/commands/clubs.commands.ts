import type { RoleInput } from '../../domain/entities/role';

export class CreateClubCommand {
  constructor(
    readonly userId: string,
    readonly input: { slug: string; name: string },
  ) {}
}

export class CreateClubRoleCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly input: RoleInput,
  ) {}
}

export class UpdateClubRoleCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly roleId: string,
    readonly input: Partial<RoleInput>,
  ) {}
}

export class DeleteClubRoleCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly roleId: string,
  ) {}
}

export class ReorderClubRolesCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly roleIds: readonly string[],
  ) {}
}

export class InviteClubMemberCommand {
  constructor(
    readonly clubId: string,
    readonly inviterId: string,
    readonly roleId: string,
  ) {}
}

export class AcceptClubInvitationCommand {
  constructor(
    readonly clubId: string,
    readonly userId: string,
    readonly token: string,
  ) {}
}

export class ChangeClubMemberRoleCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly targetId: string,
    readonly roleId: string,
  ) {}
}

export class RemoveClubMemberCommand {
  constructor(
    readonly clubId: string,
    readonly actorId: string,
    readonly targetId: string,
  ) {}
}
