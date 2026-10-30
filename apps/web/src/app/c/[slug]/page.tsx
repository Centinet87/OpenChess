'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AuthScreen } from '../../../components/AuthScreen';
import { RoleTag } from '../../../components/RoleTag';
import { Topbar } from '../../../components/Topbar';
import {
  api,
  errorMessage,
  type GameView,
  type InvitationView,
  type MemberView,
  type MyClubView,
  type Profile,
  type RoleView,
} from '../../../lib/api';
import { clubUrl, rootUrl } from '../../../lib/host';
import { useMe } from '../../../lib/use-me';

const TIME_CONTROLS = ['1+0', '3+2', '5+3', '10+5', '15+10'];
const POLL_MS = 4000;

/** Portada del club en su subdominio: partidas, desafiar, miembros e invitaciones. */
export default function ClubPage() {
  const { slug } = useParams<{ slug: string }>();
  const session = useMe();
  const [club, setClub] = useState<MyClubView | null | undefined>(undefined);

  useEffect(() => {
    if (session.status !== 'ready') return;
    api
      .get<MyClubView[]>('/clubs/mine')
      .then(({ data }) => setClub(data.find((c) => c.slug === slug) ?? null))
      .catch(() => setClub(null));
  }, [session.status, slug]);

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen onSuccess={session.reload} title="Entra a tu club." />
      </main>
    );
  }
  if (club === undefined) return <main className="shell" aria-busy="true" />;
  if (club === null) {
    return (
      <main className="shell">
        <Topbar me={session.me} />
        <h1 className="page-title">No eres miembro de este club</h1>
        <p className="lead">
          Pídele un link de invitación a un dueño o profesor del club.{' '}
          <a href={rootUrl('/')}>Volver a tus clubes</a>
        </p>
      </main>
    );
  }

  return <ClubHome me={session.me} club={club} />;
}

function ClubHome({ me, club }: { me: Profile; club: MyClubView }) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [games, setGames] = useState<GameView[]>([]);
  const [myRole, setMyRole] = useState<RoleView | null>(null);

  const loadGames = useCallback(() => {
    api
      .get<GameView[]>('/club/games')
      .then(({ data }) => setGames(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    api.get<MemberView[]>('/club/members').then(({ data }) => setMembers(data));
    api.get<RoleView>('/club/me').then(({ data }) => setMyRole(data));
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
      <p className="eyebrow">{club.role.name}</p>
      <h1 className="page-title">{club.name}</h1>

      <div className="grid-2" style={{ marginTop: 'var(--space-8)' }}>
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

type GamesPanelProps = {
  me: Profile;
  games: GameView[];
  nameOf: (userId: string) => string;
  onChange: () => void;
};

function GamesPanel({ me, games, nameOf, onChange }: GamesPanelProps) {
  const [error, setError] = useState<string | null>(null);

  const respond = async (gameId: string, action: 'accept' | 'decline') => {
    setError(null);
    try {
      await api.post(`/club/games/${gameId}/${action}`);
      if (action === 'accept') window.location.href = `/games/${gameId}`;
      else onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="card" aria-labelledby="games-title">
      <div className="section-head">
        <h2 id="games-title">Partidas</h2>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {games.length === 0 && (
        <p className="empty">No hay partidas en curso ni desafíos.</p>
      )}
      <ul className="list">
        {games.map((g) => {
          const isMine = g.whiteId === me.id || g.blackId === me.id;
          const isForMe =
            g.status === 'pending' && isMine && g.challengerId !== me.id;
          const minutes = g.timeControl.initialMs / 60_000;
          const label = `${minutes}+${g.timeControl.incrementMs / 1000}`;
          return (
            <li key={g.id}>
              <div>
                <strong>
                  {nameOf(g.whiteId)} <span className="muted">vs</span>{' '}
                  {nameOf(g.blackId)}
                </strong>
                <div className="muted" style={{ fontSize: '0.875rem' }}>
                  {label} ·{' '}
                  {g.status === 'pending' ? 'desafío pendiente' : 'en juego'}
                </div>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                {isForMe && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => respond(g.id, 'accept')}
                    >
                      Aceptar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => respond(g.id, 'decline')}
                    >
                      Rechazar
                    </button>
                  </>
                )}
                {g.status === 'pending' && g.challengerId === me.id && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => respond(g.id, 'decline')}
                  >
                    Cancelar
                  </button>
                )}
                {g.status === 'in_progress' && (
                  <a className="btn btn-sm" href={`/games/${g.id}`}>
                    {isMine ? 'Jugar' : 'Mirar'}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type ChallengeFormProps = {
  me: Profile;
  members: MemberView[];
  onCreated: () => void;
};

function ChallengeForm({ me, members, onCreated }: ChallengeFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const opponents = members.filter((m) => m.userId !== me.id);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSent(false);
    try {
      await api.post('/club/games', {
        opponentId: form.get('opponentId'),
        timeControl: form.get('timeControl'),
        color: form.get('color'),
      });
      setSent(true);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <section className="card" aria-labelledby="challenge-title">
      <h2 id="challenge-title">Desafiar</h2>
      {opponents.length === 0 ? (
        <p className="empty">
          Cuando haya más miembros en el club vas a poder desafiarlos.
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="opponentId">Rival</label>
            <select id="opponentId" name="opponentId" required>
              {opponents.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="timeControl">Tiempo</label>
              <select id="timeControl" name="timeControl" defaultValue="5+3">
                {TIME_CONTROLS.map((tc) => (
                  <option key={tc} value={tc}>
                    {tc.replace('+', ' min + ')} s
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="color">Juegas con</label>
              <select id="color" name="color" defaultValue="random">
                <option value="random">Al azar</option>
                <option value="white">Blancas</option>
                <option value="black">Negras</option>
              </select>
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {sent && (
            <p className="notice" role="status">
              Desafío enviado. Empieza cuando tu rival lo acepte.
            </p>
          )}
          <button type="submit" className="btn btn-primary">
            Enviar desafío
          </button>
        </form>
      )}
    </section>
  );
}

function MembersPanel({
  members,
  meId,
}: {
  members: MemberView[];
  meId: string;
}) {
  return (
    <section className="card" aria-labelledby="members-title">
      <h2 id="members-title">Miembros</h2>
      <ul className="list">
        {members.map((m) => (
          <li key={m.userId}>
            <span>
              {m.displayName}
              {m.userId === meId && <span className="muted"> (tú)</span>}
            </span>
            <RoleTag role={m.role} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvitePanel({ myRole, slug }: { myRole: RoleView; slug: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [roles, setRoles] = useState<RoleView[]>([]);

  useEffect(() => {
    // Solo se puede invitar con un rol por debajo del propio (0 es el más alto).
    api
      .get<RoleView[]>('/club/roles')
      .then(({ data }) =>
        setRoles(data.filter((r) => r.position > myRole.position)),
      );
  }, [myRole.position]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setIsCopied(false);
    try {
      const { data } = await api.post<InvitationView>('/club/invitations', {
        roleId: form.get('roleId'),
      });
      setLink(clubUrl(slug, `/join?token=${encodeURIComponent(data.token)}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setIsCopied(true);
  };

  return (
    <section className="card" aria-labelledby="invite-title">
      <h2 id="invite-title">Invitar</h2>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="roleId">Como</label>
          <select id="roleId" name="roleId" required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="field-hint">
            El link sirve una vez y vence en 7 días.
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn">
          Generar link
        </button>
      </form>
      {link && (
        <div className="code-box" style={{ marginTop: 'var(--space-4)' }}>
          <span style={{ flex: 1 }}>{link}</span>
          <button type="button" className="btn btn-sm" onClick={handleCopy}>
            {isCopied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      )}
    </section>
  );
}
