-- CreateTable
CREATE TABLE "lesson_training_ratings" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "marathonEventId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_training_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_training_ratings_enrollmentId_marathonEventId_lessonId_key" ON "lesson_training_ratings"("enrollmentId", "marathonEventId", "lessonId");

-- CreateIndex
CREATE INDEX "lesson_training_ratings_enrollmentId_idx" ON "lesson_training_ratings"("enrollmentId");

-- CreateIndex
CREATE INDEX "lesson_training_ratings_lessonId_idx" ON "lesson_training_ratings"("lessonId");

-- AddForeignKey
ALTER TABLE "lesson_training_ratings" ADD CONSTRAINT "lesson_training_ratings_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_training_ratings" ADD CONSTRAINT "lesson_training_ratings_marathonEventId_fkey" FOREIGN KEY ("marathonEventId") REFERENCES "marathon_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_training_ratings" ADD CONSTRAINT "lesson_training_ratings_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
