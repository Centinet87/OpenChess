-- CreateTable
CREATE TABLE "fide_links" (
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fide_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "federation" TEXT,
    "title" TEXT,
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "ratings_updated_at" TIMESTAMP(3) NOT NULL,
    "linked_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fide_links_pkey" PRIMARY KEY ("club_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fide_links_club_id_fide_id_key" ON "fide_links"("club_id", "fide_id");

-- AddForeignKey
ALTER TABLE "fide_links" ADD CONSTRAINT "fide_links_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: solo los FIDE ID del club del contexto (ver 20261029044500_rls).
GRANT SELECT, INSERT, UPDATE, DELETE ON fide_links TO app_user;

ALTER TABLE fide_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE fide_links FORCE ROW LEVEL SECURITY;

CREATE POLICY fide_links_isolation ON fide_links
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
