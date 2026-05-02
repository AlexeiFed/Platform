-- CreateTable
CREATE TABLE "marathon_event_lessons" (
    "id" TEXT NOT NULL,
    "marathonEventId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marathon_event_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marathon_event_lessons_marathonEventId_lessonId_key" ON "marathon_event_lessons"("marathonEventId", "lessonId");

-- CreateIndex
CREATE INDEX "marathon_event_lessons_marathonEventId_idx" ON "marathon_event_lessons"("marathonEventId");

-- CreateIndex
CREATE INDEX "marathon_event_lessons_lessonId_idx" ON "marathon_event_lessons"("lessonId");

-- AddForeignKey
ALTER TABLE "marathon_event_lessons" ADD CONSTRAINT "marathon_event_lessons_marathonEventId_fkey" FOREIGN KEY ("marathonEventId") REFERENCES "marathon_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marathon_event_lessons" ADD CONSTRAINT "marathon_event_lessons_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-lesson links
INSERT INTO "marathon_event_lessons" ("id", "marathonEventId", "lessonId", "position", "createdAt")
SELECT gen_random_uuid()::text, "id", "lessonId", 0, CURRENT_TIMESTAMP
FROM "marathon_events"
WHERE "lessonId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "marathon_events" DROP CONSTRAINT IF EXISTS "marathon_events_lessonId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "marathon_events_lessonId_idx";

-- AlterTable
ALTER TABLE "marathon_events" DROP COLUMN "lessonId";
