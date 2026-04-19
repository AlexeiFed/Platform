-- Добавляет профиль студента (weight/height + фото прогресса + замеры)
-- и поле attachments для сообщений обратной связи.

-- CuratorFeedbackMessage.attachments
ALTER TABLE "curator_feedback_messages" ADD COLUMN "attachments" JSONB;

-- User profile fields
ALTER TABLE "users" ADD COLUMN "weight" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "height" DOUBLE PRECISION;

-- Enum ProgressPhotoType
CREATE TYPE "ProgressPhotoType" AS ENUM ('BEFORE', 'AFTER');

-- UserProgressPhoto
CREATE TABLE "user_progress_photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ProgressPhotoType" NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_progress_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_progress_photos_userId_type_position_idx"
    ON "user_progress_photos"("userId", "type", "position");

ALTER TABLE "user_progress_photos"
    ADD CONSTRAINT "user_progress_photos_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserMeasurement
CREATE TABLE "user_measurements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shoulders" DOUBLE PRECISION,
    "aboveChest" DOUBLE PRECISION,
    "belowChest" DOUBLE PRECISION,
    "waist" DOUBLE PRECISION,
    "abdomen" DOUBLE PRECISION,
    "hips" DOUBLE PRECISION,
    "thighRight" DOUBLE PRECISION,
    "thighLeft" DOUBLE PRECISION,
    "calfRight" DOUBLE PRECISION,
    "calfLeft" DOUBLE PRECISION,
    "armRight" DOUBLE PRECISION,
    "armLeft" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_measurements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_measurements_userId_date_idx"
    ON "user_measurements"("userId", "date");

ALTER TABLE "user_measurements"
    ADD CONSTRAINT "user_measurements_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
