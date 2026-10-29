-- CreateTable
CREATE TABLE "ratings" (
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("club_id","user_id")
);

-- CreateTable
CREATE TABLE "rating_changes" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opponent_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rating_before" DOUBLE PRECISION NOT NULL,
    "rating_after" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ratings_club_id_rating_idx" ON "ratings"("club_id", "rating");

-- CreateIndex
CREATE INDEX "rating_changes_club_id_user_id_created_at_idx" ON "rating_changes"("club_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rating_changes_game_id_user_id_key" ON "rating_changes"("game_id", "user_id");

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_changes" ADD CONSTRAINT "rating_changes_opponent_id_fkey" FOREIGN KEY ("opponent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: solo los ratings del club del contexto (ver 20261029044500_rls).
GRANT SELECT, INSERT, UPDATE, DELETE ON ratings, rating_changes TO app_user;

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings FORCE ROW LEVEL SECURITY;

CREATE POLICY ratings_isolation ON ratings
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());

ALTER TABLE rating_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rating_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY rating_changes_isolation ON rating_changes
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
