import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "../application";

export const uuidGenerator: IdGenerator = { next: () => randomUUID() };
export const systemClock: Clock = { now: () => Date.now() };
