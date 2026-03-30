import { EventEmitter } from "events";

type HomeworkEvent = {
  type: "homework";
  submissionId: string;
  lessonId?: string;
  userId?: string;
  ts: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __learnhubRealtime: EventEmitter | undefined;
}

const emitter = globalThis.__learnhubRealtime ?? new EventEmitter();
globalThis.__learnhubRealtime = emitter;

export function emitHomeworkEvent(evt: Omit<HomeworkEvent, "type" | "ts">) {
  emitter.emit("event", { type: "homework", ts: Date.now(), ...evt } satisfies HomeworkEvent);
}

export function onEvent(cb: (evt: HomeworkEvent) => void) {
  emitter.on("event", cb);
  return () => emitter.off("event", cb);
}

