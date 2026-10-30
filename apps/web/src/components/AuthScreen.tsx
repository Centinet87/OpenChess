import { AuthForm } from './AuthForm';

type Props = {
  onSuccess: () => void;
  title?: string;
};

/** Pantalla de acceso: el mismo formulario sirve en el dominio raíz y en cada club. */
export function AuthScreen({
  onSuccess,
  title = 'Tu club, cada jugada.',
}: Props) {
  return (
    <section className="auth">
      <div>
        <p className="eyebrow">Clubes y academias de ajedrez</p>
        <h1 className="page-title">{title}</h1>
        <p className="lead">
          Partidas en vivo entre los miembros del club, con reloj y ranking
          interno. Cada club tiene su propio espacio.
        </p>
        <div className="auth-art" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
      <AuthForm onSuccess={onSuccess} />
    </section>
  );
}
