'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AuthScreen } from '../components/AuthScreen';
import { RoleTag } from '../components/RoleTag';
import { Topbar } from '../components/Topbar';
import { api, errorMessage, type MyClubView } from '../lib/api';
import { clubUrl } from '../lib/host';
import { useMe } from '../lib/use-me';

/** Dominio raíz: acceso, mis clubes y crear un club. */
export default function HomePage() {
  const session = useMe();

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    return (
      <main className="shell">
        <Topbar />
        <AuthScreen onSuccess={session.reload} />
      </main>
    );
  }

  return (
    <main className="shell">
      <Topbar me={session.me} />
      <p className="eyebrow">Hola, {session.me.displayName}</p>
      <h1 className="page-title">Tus clubes</h1>
      <div className="grid-2" style={{ marginTop: 'var(--space-8)' }}>
        <ClubList />
        <CreateClub />
      </div>
    </main>
  );
}

function ClubList() {
  const [clubs, setClubs] = useState<MyClubView[] | null>(null);

  useEffect(() => {
    api
      .get<MyClubView[]>('/clubs/mine')
      .then(({ data }) => setClubs(data))
      .catch(() => setClubs([]));
  }, []);

  return (
    <section className="card" aria-labelledby="clubs-title">
      <h2 id="clubs-title">Miembro de</h2>
      {clubs === null && <p className="muted">Cargando…</p>}
      {clubs?.length === 0 && (
        <p className="empty">
          Todavía no estás en ningún club. Crea uno o pide un link de
          invitación.
        </p>
      )}
      <ul className="list">
        {clubs?.map((club) => (
          <li key={club.id}>
            <a className="club-link" href={clubUrl(club.slug)}>
              <strong>{club.name}</strong>
              <span className="muted">{club.slug}</span>
            </a>
            <RoleTag role={club.role} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreateClub() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slug, setSlug] = useState('');

  const handleName = useCallback((name: string) => {
    // Sugerencia de subdominio a partir del nombre; se puede editar.
    setSlug(
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32),
    );
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ slug: string }>('/clubs', {
        name: form.get('name'),
        slug: form.get('slug'),
      });
      window.location.href = clubUrl(data.slug);
    } catch (e) {
      setError(errorMessage(e));
      setIsSubmitting(false);
    }
  };

  return (
    <section className="card" aria-labelledby="create-title">
      <h2 id="create-title">Crear un club</h2>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Nombre del club</label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            onChange={(e) => handleName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="slug">Dirección</label>
          <div className="input-affix">
            <input
              id="slug"
              name="slug"
              required
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              aria-describedby="slug-hint"
            />
            <span>.{process.env.NEXT_PUBLIC_APP_DOMAIN}</span>
          </div>
          <span id="slug-hint" className="field-hint">
            Minúsculas, números y guiones. Es el link que compartes con tus
            alumnos.
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting}
        >
          Crear club
        </button>
      </form>
    </section>
  );
}
