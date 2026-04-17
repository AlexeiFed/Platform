-- AddColumn readAt to curator_feedback_messages
ALTER TABLE "curator_feedback_messages" ADD COLUMN "readAt" TIMESTAMP(3);
