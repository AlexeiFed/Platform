-- AlterTable: add readAt to curator_feedback_messages for unread tracking
ALTER TABLE "curator_feedback_messages" ADD COLUMN "readAt" TIMESTAMP(3);
