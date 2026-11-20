// Messages from the content script to the background worker.
import type { CookieResult } from "./storage";

export type ContentMessage =
  | ({ type: "cookie-result" } & Omit<CookieResult, "at">)
  | { type: "policy-page" };

export function isContentMessage(value: unknown): value is ContentMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  return value.type === "cookie-result" || value.type === "policy-page";
}
