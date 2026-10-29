-- CreateEnum
CREATE TYPE "game_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'FINISHED');

-- CreateTable
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "white_id" UUID NOT NULL,
    "black_id" UUID NOT NULL,
    "challenger_id" UUID NOT NULL,
    "time_kind" TEXT NOT NULL,
    "initial_ms" INTEGER NOT NULL,
    "increment_ms" INTEGER NOT NULL,
    "pgn" TEXT NOT NULL DEFAULT '',
    "clock" JSONB NOT NULL,
    "draw_offer_by" TEXT,
    "status" "game_status" NOT NULL,
    "result" TEXT,
    "termination" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "games_club_id_status_idx" ON "games"("club_id", "status");

-- CreateIndex
CREATE INDEX "games_white_id_idx" ON "games"("white_id");

-- CreateIndex
CREATE INDEX "games_black_id_idx" ON "games"("black_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_white_id_fkey" FOREIGN KEY ("white_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_black_id_fkey" FOREIGN KEY ("black_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: solo las partidas del club del contexto (ver 20261029044500_rls).
GRANT SELECT, INSERT, UPDATE, DELETE ON games TO app_user;

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE games FORCE ROW LEVEL SECURITY;

CREATE POLICY games_isolation ON games
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
