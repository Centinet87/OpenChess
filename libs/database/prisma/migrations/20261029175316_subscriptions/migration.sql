-- CreateTable
CREATE TABLE "subscriptions" (
    "club_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payer_email" TEXT NOT NULL,
    "next_payment_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("club_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: solo la suscripción del club del contexto (ver 20261029044500_rls). El
-- webhook de Mercado Pago fija el club a partir de la suscripción consultada.
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions TO app_user;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_isolation ON subscriptions
  USING (club_id = app_current_club_id())
  WITH CHECK (club_id = app_current_club_id());
