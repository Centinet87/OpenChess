-- La política única de memberships usaba el mismo USING para leer y para borrar:
-- con `user_id = app_current_user_id()` un usuario podía borrar sus membresías
-- de otros clubes (o sin club en el contexto). Se separa por comando: leer las
-- del club y las propias, escribir solo dentro del club actual.

DROP POLICY memberships_isolation ON memberships;

CREATE POLICY memberships_select ON memberships
  FOR SELECT
  USING (club_id = app_current_club_id() OR user_id = app_current_user_id());

CREATE POLICY memberships_insert ON memberships
  FOR INSERT
  WITH CHECK (club_id = app_current_club_id());

CREATE POLICY memberships_update ON memberships
  FOR UPDATE
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());

CREATE POLICY memberships_delete ON memberships
  FOR DELETE
  USING (club_id = app_current_club_id());
