-- Aislamiento entre clubes con Row Level Security.
--
-- La app no consulta como dueño de las tablas: cada transacción hace
-- `SET LOCAL ROLE app_user` y fija app.club_id / app.user_id (ver
-- libs/database/src/lib/tenant.ts). Los superusuarios y el dueño de la tabla
-- se saltan RLS, por eso el cambio de rol es obligatorio.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- El usuario con el que conecta la app tiene que poder hacer SET ROLE app_user.
GRANT app_user TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, clubs, memberships, invitations, refresh_tokens TO app_user;

-- Contexto de la transacción. NULLIF evita el error de castear '' a uuid
-- cuando la variable no está fijada.
CREATE FUNCTION app_current_club_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.club_id', true), '')::uuid $$;

CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app_current_club_id(), app_current_user_id() TO app_user;

-- memberships: se ven las del club actual y las propias (para listar "mis clubes").
-- Solo se escriben dentro del club actual.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_isolation ON memberships
  USING (club_id = app_current_club_id() OR user_id = app_current_user_id())
  WITH CHECK (club_id = app_current_club_id());

-- invitations: solo las del club actual.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_isolation ON invitations
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
