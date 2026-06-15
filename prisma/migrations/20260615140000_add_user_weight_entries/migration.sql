-- Записи веса «после» для отслеживания прогресса

CREATE TABLE "user_weight_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_weight_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_weight_entries_userId_date_idx"
    ON "user_weight_entries"("userId", "date");

ALTER TABLE "user_weight_entries"
    ADD CONSTRAINT "user_weight_entries_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
