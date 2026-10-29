-- Todo club tiene al menos un dueño. El dominio ya lo revisa (Roster), pero dos
-- requests que bajan o sacan a dos dueños distintos a la vez pasan las dos esa
-- revisión. Este trigger serializa los cambios de membresía de cada club y
-- vuelve a contar los dueños después del cambio.
CREATE FUNCTION memberships_keep_owner() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  -- Un club a la vez: la segunda transacción espera a que la primera termine y
  -- su próxima consulta ya ve lo que la primera cambió.
  PERFORM pg_advisory_xact_lock(hashtext('club-owners:' || OLD.club_id::text));

  -- Si se está borrando el club entero, sus membresías se van en cascada.
  IF NOT EXISTS (SELECT 1 FROM clubs WHERE id = OLD.club_id) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM memberships m
    JOIN club_roles r ON r.id = m.role_id
    WHERE m.club_id = OLD.club_id AND r.is_owner
  ) THEN
    RAISE EXCEPTION 'LAST_OWNER: el club % se quedaría sin dueño', OLD.club_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER memberships_keep_owner
  AFTER UPDATE OF role_id OR DELETE ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION memberships_keep_owner();
