-- Replace per-event training ratings with per-block lesson ratings.
DROP TABLE IF EXISTS "lesson_training_ratings";

CREATE TABLE "lesson_block_ratings" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_block_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_block_ratings_enrollmentId_lessonId_blockId_key" ON "lesson_block_ratings"("enrollmentId", "lessonId", "blockId");

CREATE INDEX "lesson_block_ratings_enrollmentId_idx" ON "lesson_block_ratings"("enrollmentId");

CREATE INDEX "lesson_block_ratings_lessonId_idx" ON "lesson_block_ratings"("lessonId");

ALTER TABLE "lesson_block_ratings" ADD CONSTRAINT "lesson_block_ratings_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lesson_block_ratings" ADD CONSTRAINT "lesson_block_ratings_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
