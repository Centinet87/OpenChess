'use client';
import { gamesApi } from '../../games/api/games.api';
import { clubsApi } from '../api/clubs.api';

import type {
  GameView,
  MemberView,
  MyClubView,
  Profile,
  RoleView,
} from '@openchess/contracts';
import { useCallback, useEffect, useState } from 'react';
import { Topbar } from '../../auth/components/Topbar';
import { ChallengeForm } from '../../games/components/lobby/ChallengeForm';
import { GamesPanel } from '../../games/components/lobby/GamesPanel';
import { canAdminister } from '../model/permissions';
import { InvitePanel } from './invitations/InvitePanel';
import { MembersPanel } from './members/MembersPanel';

const POLL_MS = 4000;

export function ClubHome({ me, club }: { me: Profile; club: MyClubView }) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [games, setGames] = useState<GameView[]>([]);
  const [myRole, setMyRole] = useState<RoleView | null>(null);

  const loadGames = useCallback(() => {
    gamesApi
      .list()
      .then(({ data }) => setGames(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    clubsApi.members().then(({ data }) => setMembers(data));
    clubsApi.myRole().then(({ data }) => setMyRole(data));
    loadGames();
    // Limitación: los desafíos nuevos se ven por polling; un canal del club por WebSocket los haría instantáneos.
    const id = setInterval(loadGames, POLL_MS);
    return () => clearInterval(id);
  }, [loadGames]);

  const nameOf = (userId: string) =>
    userId === me.id
      ? 'Tú'
      : (members.find((m) => m.userId === userId)?.displayName ?? '—');
  // La API vuelve a comprobar cada permiso; aquí solo decide qué se muestra.
  const can = (permission: RoleView['permissions'][number]) =>
    myRole?.permissions.includes(permission) ?? false;

  return (
    <main className="shell">
      <Topbar me={me} clubName={club.name} />
      <p className="eyebrow">
        {club.role.name}
        {myRole && canAdminister(myRole) && (
          <>
            {' · '}
            <a href="/admin">Panel de administración</a>
          </>
        )}
      </p>
      <h1 className="page-title">{club.name}</h1>

      <div className="grid-2 mt-(--space-8)">
        <div className="stack">
          <GamesPanel
            me={me}
            games={games}
            nameOf={nameOf}
            onChange={loadGames}
          />
          {can('PLAY_GAMES') && (
            <ChallengeForm me={me} members={members} onCreated={loadGames} />
          )}
        </div>
        <div className="stack">
          <MembersPanel members={members} meId={me.id} />
          {myRole && can('INVITE_MEMBERS') && (
            <InvitePanel myRole={myRole} slug={club.slug} />
          )}
        </div>
      </div>
    </main>
  );
}
