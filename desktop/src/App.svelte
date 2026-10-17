<script lang="ts">
  import { onMount } from "svelte";
  import { getStatus } from "./lib/api";
  import type { Status } from "./lib/bindings/Status";
  import DockerPanel from "./lib/components/DockerPanel.svelte";
  import StackPanel from "./lib/components/StackPanel.svelte";

  const POLL_MS = 15_000;

  // Long enough to be noticed when the check itself is instant.
  const MIN_FEEDBACK_MS = 1500;

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);
  let checkedAt = $state<Date | null>(null);
  /** True only while a check the user asked for is running; background polls never set it. */
  let userChecking = $state(false);

  // One request at a time: callers that arrive while one is running share it.
  let inFlight: Promise<void> | null = null;

  function refresh(): Promise<void> {
    inFlight ??= (async () => {
      try {
        status = await getStatus();
        error = null;
        checkedAt = new Date();
      } catch (e) {
        error = String(e);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function checkAgain() {
    if (userChecking) return;
    userChecking = true;
    try {
      await Promise.all([refresh(), new Promise((r) => setTimeout(r, MIN_FEEDBACK_MS))]);
    } finally {
      userChecking = false;
    }
  }

  // Poll while the window is visible; the next poll starts only after the last one ended.
  onMount(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await refresh();
      timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<main>
  <header>
    <h1>ArboDat+</h1>
    {#if status}<span class="muted">Version {status.appVersion}</span>{/if}
  </header>

  {#if error}
    <section><div class="hint bad">Couldn't check the status: <pre>{error}</pre></div></section>
  {/if}

  {#if status}
    <DockerPanel docker={status.docker} />
    <StackPanel stack={status.stack} appVersion={status.appVersion} />
  {:else if !error}
    <section><p class="muted">Checking…</p></section>
  {/if}

  <footer>
    <button onclick={checkAgain} disabled={userChecking}>{userChecking ? "Checking…" : "Check again"}</button>
    {#if checkedAt}<span class="muted">Last checked {checkedAt.toLocaleTimeString()}</span>{/if}
  </footer>
</main>

<style>
  header { display: flex; align-items: baseline; justify-content: space-between; }
  footer { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
</style>
