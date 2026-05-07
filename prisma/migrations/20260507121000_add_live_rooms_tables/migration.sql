-- Live rooms / recordings / chat.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveRoomStatus') THEN
    CREATE TYPE "LiveRoomStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveRoomParticipantRole') THEN
    CREATE TYPE "LiveRoomParticipantRole" AS ENUM ('HOST', 'SPEAKER', 'VIEWER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveRecordingStatus') THEN
    CREATE TYPE "LiveRecordingStatus" AS ENUM ('IDLE', 'RECORDING', 'PROCESSING', 'READY', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveRecordingProfile') THEN
    CREATE TYPE "LiveRecordingProfile" AS ENUM ('AUDIO', 'LOW', 'HIGH');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "live_rooms" (
  "id" TEXT NOT NULL,
  "marathonEventId" TEXT NOT NULL,
  "status" "LiveRoomStatus" NOT NULL DEFAULT 'SCHEDULED',
  "title" TEXT,
  "maxSpeakers" INTEGER NOT NULL DEFAULT 6,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_rooms_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_rooms_marathonEventId_key" UNIQUE ("marathonEventId"),
  CONSTRAINT "live_rooms_marathonEventId_fkey" FOREIGN KEY ("marathonEventId") REFERENCES "marathon_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "live_rooms_marathonEventId_idx" ON "live_rooms"("marathonEventId");
CREATE INDEX IF NOT EXISTS "live_rooms_status_idx" ON "live_rooms"("status");

CREATE TABLE IF NOT EXISTS "live_room_participants" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "LiveRoomParticipantRole" NOT NULL DEFAULT 'VIEWER',
  "speakerRequestedAt" TIMESTAMP(3),
  "speakerApprovedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  CONSTRAINT "live_room_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_room_participants_roomId_userId_key" UNIQUE ("roomId", "userId"),
  CONSTRAINT "live_room_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "live_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "live_room_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "live_room_participants_roomId_idx" ON "live_room_participants"("roomId");
CREATE INDEX IF NOT EXISTS "live_room_participants_userId_idx" ON "live_room_participants"("userId");
CREATE INDEX IF NOT EXISTS "live_room_participants_role_idx" ON "live_room_participants"("role");

CREATE TABLE IF NOT EXISTS "live_room_recordings" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "status" "LiveRecordingStatus" NOT NULL DEFAULT 'IDLE',
  "profile" "LiveRecordingProfile" NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "manifestUrl" TEXT,
  "durationSec" INTEGER,
  "sizeBytes" BIGINT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_room_recordings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_room_recordings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "live_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "live_room_recordings_roomId_idx" ON "live_room_recordings"("roomId");
CREATE INDEX IF NOT EXISTS "live_room_recordings_status_idx" ON "live_room_recordings"("status");

CREATE TABLE IF NOT EXISTS "live_chat_messages" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "live_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "live_chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "live_chat_messages_roomId_createdAt_idx" ON "live_chat_messages"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "live_chat_messages_userId_idx" ON "live_chat_messages"("userId");

