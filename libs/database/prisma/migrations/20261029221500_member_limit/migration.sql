-- Tope de miembros del plan. La app lo revisa antes de invitar o aceptar, pero
-- dos invitaciones aceptadas a la vez pasan las dos esa revisión. Este trigger
-- serializa las altas de cada club y vuelve a contar. El tope lo decide la app
-- y lo fija en la misma transacción (app.max_members); sin él no hay tope, como
-- al crear el club o en el plan Pro.
CREATE FUNCTION memberships_member_limit() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  max_members integer := NULLIF(current_setting('app.max_members', true), '')::integer;
BEGIN
  IF max_members IS NULL THEN
    RETURN NEW;
  END IF;

  -- Un club a la vez: la segunda transacción espera a que la primera termine y
  -- su próxima consulta ya ve la fila que la primera agregó.
  PERFORM pg_advisory_xact_lock(hashtext('club-members:' || NEW.club_id::text));

  IF (SELECT count(*) FROM memberships WHERE club_id = NEW.club_id) >= max_members THEN
    RAISE EXCEPTION 'MEMBER_LIMIT: el club % llegó a su tope de % miembros', NEW.club_id, max_members
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER memberships_member_limit
  BEFORE INSERT ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION memberships_member_limit();
