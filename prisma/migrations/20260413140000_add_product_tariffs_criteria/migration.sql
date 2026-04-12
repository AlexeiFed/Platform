-- CreateEnum
CREATE TYPE "ProductCriterion" AS ENUM ('NUTRITION_CONTENT', 'ONLINE_TRAINING', 'TASKS', 'COMMUNITY_CHAT', 'HOMEWORK_REVIEW', 'CURATOR_FEEDBACK', 'MARATHON_LIVE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('INITIAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "TariffUpgradeStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'APPLIED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "enabledCriteria" "ProductCriterion"[] DEFAULT ARRAY[]::"ProductCriterion"[];

UPDATE "products" SET "enabledCriteria" = ARRAY[
  'NUTRITION_CONTENT',
  'ONLINE_TRAINING',
  'TASKS',
  'COMMUNITY_CHAT',
  'HOMEWORK_REVIEW',
  'CURATOR_FEEDBACK',
  'MARATHON_LIVE'
]::"ProductCriterion"[] WHERE COALESCE(array_length("enabledCriteria", 1), 0) = 0;

ALTER TABLE "products" ALTER COLUMN "enabledCriteria" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "enabledCriteria" SET DEFAULT ARRAY[]::"ProductCriterion"[];

-- CreateTable
CREATE TABLE "product_tariffs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "criteria" "ProductCriterion"[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_upgrades" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "fromTariffId" TEXT NOT NULL,
    "toTariffId" TEXT NOT NULL,
    "status" "TariffUpgradeStatus" NOT NULL DEFAULT 'DRAFT',
    "quotedFromPrice" DECIMAL(10,2) NOT NULL,
    "quotedToPrice" DECIMAL(10,2) NOT NULL,
    "quotedDelta" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "paymentId" TEXT,
    "appliedCriteriaSnapshot" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_tariff_history" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "fromTariffId" TEXT,
    "toTariffId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'payment',
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_tariff_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curator_feedback_messages" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curator_feedback_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_tariffs_productId_sortOrder_idx" ON "product_tariffs"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "product_tariffs_productId_published_idx" ON "product_tariffs"("productId", "published");

-- AddForeignKey
ALTER TABLE "product_tariffs" ADD CONSTRAINT "product_tariffs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Дефолтный тариф на каждый продукт (до привязки enrollments)
INSERT INTO "product_tariffs" ("id", "productId", "name", "price", "currency", "sortOrder", "published", "criteria", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p.id,
  'Базовый',
  COALESCE(p.price, 0),
  p.currency,
  0,
  true,
  p."enabledCriteria",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products" p
WHERE NOT EXISTS (SELECT 1 FROM "product_tariffs" t WHERE t."productId" = p.id);

-- AlterTable enrollments: nullable tariff сначала
ALTER TABLE "enrollments" ADD COLUMN "tariffId" TEXT;

UPDATE "enrollments" e
SET "tariffId" = (
  SELECT t.id FROM "product_tariffs" t
  WHERE t."productId" = e."productId"
  ORDER BY t."sortOrder" ASC, t."createdAt" ASC
  LIMIT 1
);

ALTER TABLE "enrollments" ALTER COLUMN "tariffId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "enrollments_tariffId_idx" ON "enrollments"("tariffId");

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "product_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable payments
ALTER TABLE "payments" ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'INITIAL',
ADD COLUMN "tariffId" TEXT;

CREATE INDEX "payments_tariffId_idx" ON "payments"("tariffId");

ALTER TABLE "payments" ADD CONSTRAINT "payments_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "product_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "tariff_upgrades_paymentId_key" ON "tariff_upgrades"("paymentId");

-- CreateIndex
CREATE INDEX "tariff_upgrades_enrollmentId_status_idx" ON "tariff_upgrades"("enrollmentId", "status");

-- CreateIndex
CREATE INDEX "tariff_upgrades_toTariffId_idx" ON "tariff_upgrades"("toTariffId");

-- AddForeignKey
ALTER TABLE "tariff_upgrades" ADD CONSTRAINT "tariff_upgrades_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tariff_upgrades" ADD CONSTRAINT "tariff_upgrades_fromTariffId_fkey" FOREIGN KEY ("fromTariffId") REFERENCES "product_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tariff_upgrades" ADD CONSTRAINT "tariff_upgrades_toTariffId_fkey" FOREIGN KEY ("toTariffId") REFERENCES "product_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tariff_upgrades" ADD CONSTRAINT "tariff_upgrades_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "enrollment_tariff_history_enrollmentId_createdAt_idx" ON "enrollment_tariff_history"("enrollmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "enrollment_tariff_history" ADD CONSTRAINT "enrollment_tariff_history_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollment_tariff_history" ADD CONSTRAINT "enrollment_tariff_history_fromTariffId_fkey" FOREIGN KEY ("fromTariffId") REFERENCES "product_tariffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "enrollment_tariff_history" ADD CONSTRAINT "enrollment_tariff_history_toTariffId_fkey" FOREIGN KEY ("toTariffId") REFERENCES "product_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollment_tariff_history" ADD CONSTRAINT "enrollment_tariff_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "curator_feedback_messages_enrollmentId_createdAt_idx" ON "curator_feedback_messages"("enrollmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "curator_feedback_messages" ADD CONSTRAINT "curator_feedback_messages_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "curator_feedback_messages" ADD CONSTRAINT "curator_feedback_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
