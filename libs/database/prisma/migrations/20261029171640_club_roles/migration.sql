-- Roles configurables por club (ver libs/clubs). Reemplaza al enum member_role:
-- cada club existente parte con Admin (dueño), Profesor y Alumno, y sus
-- miembros e invitaciones quedan con el rol equivalente.

-- CreateTable
CREATE TABLE "club_roles" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL,
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_roles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "club_roles_club_id_position_idx" ON "club_roles"("club_id", "position");
CREATE UNIQUE INDEX "club_roles_club_id_name_key" ON "club_roles"("club_id", "name");

ALTER TABLE "club_roles" ADD CONSTRAINT "club_roles_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los mismos roles iniciales que defaultRoles() en libs/clubs/src/domain/role.ts.
INSERT INTO "club_roles" ("id", "club_id", "name", "color", "position", "is_owner", "permissions")
SELECT gen_random_uuid(), c."id", r.name, r.color, r.position, r.is_owner, r.permissions
FROM "clubs" c
CROSS JOIN (VALUES
  ('Admin', '#c0392b', 0, TRUE,
    ARRAY['MANAGE_ROLES','INVITE_MEMBERS','REMOVE_MEMBERS','MANAGE_FIDE','PLAY_GAMES','IMPORT_GAMES']),
  ('Profesor', '#2980b9', 1, FALSE, ARRAY['INVITE_MEMBERS','PLAY_GAMES','IMPORT_GAMES']),
  ('Alumno', '#7f8c8d', 2, FALSE, ARRAY['PLAY_GAMES','IMPORT_GAMES'])
) AS r(name, color, position, is_owner, permissions);

-- Con FORCE RLS el dueño de la tabla también pasa por las políticas, y aquí no
-- hay club en el contexto: se apaga mientras se copian los datos.
ALTER TABLE "memberships" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitations" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "memberships" ADD COLUMN "role_id" UUID;
ALTER TABLE "invitations" ADD COLUMN "role_id" UUID;

UPDATE "memberships" m SET "role_id" = cr."id"
FROM "club_roles" cr
WHERE cr."club_id" = m."club_id"
  AND cr."name" = CASE m."role" WHEN 'OWNER' THEN 'Admin' WHEN 'COACH' THEN 'Profesor' ELSE 'Alumno' END;

UPDATE "invitations" i SET "role_id" = cr."id"
FROM "club_roles" cr
WHERE cr."club_id" = i."club_id"
  AND cr."name" = CASE i."role" WHEN 'OWNER' THEN 'Admin' WHEN 'COACH' THEN 'Profesor' ELSE 'Alumno' END;

ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "memberships" ALTER COLUMN "role_id" SET NOT NULL, DROP COLUMN "role";
ALTER TABLE "invitations" ALTER COLUMN "role_id" SET NOT NULL, DROP COLUMN "role";
DROP TYPE "member_role";

CREATE INDEX "memberships_role_id_idx" ON "memberships"("role_id");

-- Restrict: un rol con miembros no se borra (también lo exige el dominio).
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "club_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Si se borra un rol, sus invitaciones pendientes dejan de servir.
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "club_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: se ven los roles del club del contexto y, fuera de un club, el rol propio
-- en cada club (para listar "mis clubes" y para el guard del club).
-- Solo se escriben los del club del contexto.
GRANT SELECT, INSERT, UPDATE, DELETE ON club_roles TO app_user;

ALTER TABLE club_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY club_roles_isolation ON club_roles
  USING (
    club_id = app_current_club_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.role_id = club_roles.id
        AND m.user_id = app_current_user_id()
    )
  )
  WITH CHECK (club_id = app_current_club_id());
