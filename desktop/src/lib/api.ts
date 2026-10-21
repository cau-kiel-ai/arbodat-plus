import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppError } from "./bindings/AppError";
import type { Operation } from "./bindings/Operation";
import type { ProgressEvent } from "./bindings/ProgressEvent";
import type { Status } from "./bindings/Status";

/** Never rejects for Docker/stack problems: those are part of the returned status. */
export const getStatus = () => invoke<Status>("get_status");

/**
 * Runs install / start / stop. Progress arrives through `onEvent`; the promise rejects with an
 * `AppError` (see `asAppError`) when the operation fails.
 */
export function runOperation(operation: Operation, onEvent: (event: ProgressEvent) => void): Promise<void> {
  const channel = new Channel<ProgressEvent>();
  channel.onmessage = onEvent;
  return invoke<void>(operation, { onEvent: channel });
}

/** Rejections from our commands are `AppError`s; anything else (a bug, IPC trouble) gets wrapped. */
export function asAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "code" in e && "message" in e) return e as AppError;
  return { code: "dockerFailed", message: "Something unexpected went wrong.", detail: String(e) };
}

/** The window can't be closed while an operation runs; the backend then sends this. */
export const onCloseBlocked = (callback: () => void) => listen("close-blocked", callback);

/** Opens a link in the system browser (allowed URLs: capabilities/launcher.json). */
export const openLink = (url: string) => openUrl(url);

export type Platform = "macos" | "windows" | "linux";

export const platform: Platform = navigator.userAgent.includes("Mac")
  ? "macos"
  : navigator.userAgent.includes("Windows")
    ? "windows"
    : "linux";
