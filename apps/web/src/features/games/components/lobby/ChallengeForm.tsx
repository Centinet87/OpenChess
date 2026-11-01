'use client';
import { gamesApi } from '../../api/games.api';

import type { ChallengeInput, MemberView, Profile } from '@openchess/contracts';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../../../shared/api/client';

const TIME_CONTROLS = ['1+0', '3+2', '5+3', '10+5', '15+10'];

type ChallengeFormProps = {
  me: Profile;
  members: MemberView[];
  onCreated: () => void;
};

export function ChallengeForm({ me, members, onCreated }: ChallengeFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const opponents = members.filter((m) => m.userId !== me.id);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSent(false);
    try {
      await gamesApi.challenge({
        opponentId: String(form.get('opponentId') ?? ''),
        timeControl: String(form.get('timeControl') ?? ''),
        color: form.get('color') as ChallengeInput['color'],
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
