'use client';
import { clubsApi } from '../../api/clubs.api';

import { useCallback, useState, type FormEvent } from 'react';
import { errorMessage } from '../../../../shared/api/client';
import { clubUrl } from '../../../../shared/lib/host';

export function CreateClub() {
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
      const { data } = await clubsApi.create({
        name: String(form.get('name') ?? ''),
        slug: String(form.get('slug') ?? ''),
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
