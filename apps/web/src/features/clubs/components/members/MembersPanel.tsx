'use client';
import type { MemberView } from '@openchess/contracts';
import { RoleTag } from '../roles/RoleTag';

export function MembersPanel({
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
