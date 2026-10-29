-- CreateEnum
CREATE TYPE "chess_platform" AS ENUM ('LICHESS', 'CHESSCOM');

-- DropForeignKey
ALTER TABLE "rating_changes" DROP CONSTRAINT "rating_changes_game_id_fkey";

-- CreateTable
CREATE TABLE "linked_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "chess_platform" NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "verification_code" TEXT,
    "verified_at" TIMESTAMP(3),
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "ratings_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_games" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "platform" "chess_platform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "white_name" TEXT NOT NULL,
    "black_name" TEXT NOT NULL,
    "white_user_id" UUID,
    "black_user_id" UUID,
    "result" TEXT,
    "speed" TEXT NOT NULL,
    "standard" BOOLEAN NOT NULL,
    "pgn" TEXT NOT NULL,
    "played_at" TIMESTAMP(3) NOT NULL,
    "imported_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "linked_accounts_platform_username_idx" ON "linked_accounts"("platform", "username");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_user_id_platform_key" ON "linked_accounts"("user_id", "platform");

-- CreateIndex
CREATE INDEX "imported_games_club_id_played_at_idx" ON "imported_games"("club_id", "played_at");

-- CreateIndex
CREATE UNIQUE INDEX "imported_games_club_id_platform_external_id_key" ON "imported_games"("club_id", "platform", "external_id");

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_games" ADD CONSTRAINT "imported_games_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una cuenta verificada de Lichess o Chess.com es de una sola persona. Los
-- intentos sin verificar no bloquean a la dueña real.
CREATE UNIQUE INDEX "linked_accounts_verified_key" ON "linked_accounts"("platform", "username") WHERE "verified_at" IS NOT NULL;

-- RLS (ver 20261029044500_rls).
GRANT SELECT, INSERT, UPDATE, DELETE ON linked_accounts, imported_games TO app_user;

-- linked_accounts: se ven las propias y, dentro de un club, las de sus miembros
-- (para mostrarlas en el perfil y reconocer a los jugadores de una partida importada).
-- Solo se escriben las propias.
ALTER TABLE linked_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE linked_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY linked_accounts_isolation ON linked_accounts
  USING (
    user_id = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = linked_accounts.user_id
        AND m.club_id = app_current_club_id()
    )
  )
  WITH CHECK (user_id = app_current_user_id());

-- imported_games: solo las del club del contexto.
ALTER TABLE imported_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_games FORCE ROW LEVEL SECURITY;

CREATE POLICY imported_games_isolation ON imported_games
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
