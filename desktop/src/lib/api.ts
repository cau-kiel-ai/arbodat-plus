import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Status } from "./bindings/Status";

/** Never rejects for Docker/stack problems: those are part of the returned status. */
export const getStatus = () => invoke<Status>("get_status");

/** Opens a link in the system browser (allowed URLs: capabilities/launcher.json). */
export const openLink = (url: string) => openUrl(url);

export type Platform = "macos" | "windows" | "linux";

export const platform: Platform = navigator.userAgent.includes("Mac")
  ? "macos"
  : navigator.userAgent.includes("Windows")
    ? "windows"
    : "linux";
