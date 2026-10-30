'use client';

import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';

type Mode = 'login' | 'register';

type Props = {
  onSuccess: () => void;
};

export function AuthForm({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/auth/${mode}`, {
        email: form.get('email'),
        password: form.get('password'),
        ...(mode === 'register'
          ? { displayName: form.get('displayName') }
          : {}),
      });
      onSuccess();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRegister = mode === 'register';

  return (
    <div className="card">
      <div className="tabs" role="tablist" aria-label="Acceso">
        <button
          type="button"
          role="tab"
          aria-selected={!isRegister}
          onClick={() => setMode('login')}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isRegister}
          onClick={() => setMode('register')}
        >
          Crear cuenta
        </button>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        {isRegister && (
          <div className="field">
            <label htmlFor="displayName">Nombre</label>
            <input
              id="displayName"
              name="displayName"
              required
              maxLength={60}
              autoComplete="name"
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 10 : 1}
            maxLength={128}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
          {isRegister && (
            <span className="field-hint">Mínimo 10 caracteres.</span>
          )}
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
          {isRegister ? 'Crear cuenta' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
