'use client';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '../../auth/hooks/use-me';
import { LiveBoard } from '../components/LiveBoard';

export default function GamePage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const session = useMe();

  useEffect(() => {
    if (session.status === 'anonymous') window.location.replace('/');
  }, [session.status]);

  if (session.status === 'loading')
    return <main className="shell" aria-busy="true" />;
  if (session.status === 'anonymous') {
    // Sin sesión no hay WebSocket: se vuelve a la portada del club, que pide entrar.
    return null;
  }
  return <LiveBoard me={session.me} club={slug} gameId={id} />;
}
