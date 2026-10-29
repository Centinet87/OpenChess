import { newClub } from '../domain/club.js';
import { ClubError } from '../domain/errors.js';
import { assertAcceptable, invitationExpiry } from '../domain/invitation.js';
import { assertCanInvite, Roster, type MemberRole } from '../domain/roster.js';
import type {
  Clock,
  ClubsRepository,
  InvitationsRepository,
  MemberView,
  MyClub,
  TokenIssuer,
} from './ports.js';

export class ClubsUseCases {
  constructor(
    private readonly clubs: ClubsRepository,
    private readonly invitations: InvitationsRepository,
    private readonly tokens: TokenIssuer,
    private readonly clock: Clock,
  ) {}

  async createClub(
    userId: string,
    input: { slug: string; name: string },
  ): Promise<{ id: string; slug: string }> {
    const club = newClub(input);
    if (await this.clubs.slugExists(club.slug)) {
      throw new ClubError('SLUG_TAKEN', 'Ese subdominio ya está ocupado');
    }
    const { id } = await this.clubs.createWithOwner(club, userId);
    return { id, slug: club.slug };
  }

  listMyClubs(userId: string): Promise<MyClub[]> {
    return this.clubs.listForUser(userId);
  }

  listMembers(clubId: string): Promise<MemberView[]> {
    return this.clubs.members(clubId);
  }

  async invite(
    clubId: string,
    inviterId: string,
    role: MemberRole,
  ): Promise<{ token: string; expiresAt: Date }> {
    const inviter = await this.clubs.findMember(clubId, inviterId);
    if (!inviter)
      throw new ClubError('FORBIDDEN', 'No eres miembro de este club');
    assertCanInvite(inviter, role);

    const { token, hash } = this.tokens.issue();
    const expiresAt = invitationExpiry(this.clock.now());
    await this.invitations.create({
      clubId,
      tokenHash: hash,
      role,
      createdById: inviterId,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async acceptInvitation(
    clubId: string,
    userId: string,
    token: string,
  ): Promise<{ role: MemberRole }> {
    const invitation = await this.invitations.findByTokenHash(
      this.tokens.hash(token),
    );
    // El repositorio ve solo las del club actual; el chequeo extra no cuesta nada.
    if (!invitation || invitation.clubId !== clubId) {
      throw new ClubError('INVITATION_NOT_FOUND', 'Invitación no encontrada');
    }
    const now = this.clock.now();
    const existing = await this.clubs.findMember(clubId, userId);
    assertAcceptable(invitation, now, existing !== null);

    if (!(await this.invitations.markAccepted(invitation.id, now))) {
      throw new ClubError('INVITATION_USED', 'Esta invitación ya se usó');
    }
    await this.clubs.addMember(clubId, { userId, role: invitation.role });
    return { role: invitation.role };
  }

  async changeRole(
    clubId: string,
    actorId: string,
    targetId: string,
    role: MemberRole,
  ): Promise<void> {
    const roster = Roster.of(await this.clubs.members(clubId));
    roster.changeRole(actorId, targetId, role);
    await this.clubs.updateRole(clubId, targetId, role);
  }

  async removeMember(
    clubId: string,
    actorId: string,
    targetId: string,
  ): Promise<void> {
    const roster = Roster.of(await this.clubs.members(clubId));
    roster.remove(actorId, targetId);
    await this.clubs.removeMember(clubId, targetId);
  }
}
