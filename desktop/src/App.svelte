<script lang="ts">
  import { onMount } from "svelte";
  import { getSettings, getStatus, onCloseBlocked, openArbodat } from "./lib/api";
  import type { SettingsView } from "./lib/bindings/SettingsView";
  import type { Status } from "./lib/bindings/Status";
  import DockerPanel from "./lib/components/DockerPanel.svelte";
  import OperationPanel from "./lib/components/OperationPanel.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import StackPanel from "./lib/components/StackPanel.svelte";
  import { operation } from "./lib/operation.svelte";

  const POLL_MS = 15_000;

  // Long enough to be noticed when the check itself is instant.
  const MIN_FEEDBACK_MS = 1500;

  /** Docker Desktop can take minutes to come up when the computer has just started. */
  const AUTO_START_WINDOW_MS = 5 * 60_000;

  let status = $state<Status | null>(null);
  let settings = $state<SettingsView | null>(null);
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

  /** After an operation: an automatic poll that is still running may predate the end of the operation, so wait for it and ask again. */
  async function refreshAfterOperation() {
    if (inFlight) await inFlight;
    await refresh();
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

  /** Docker, Compose and the engine are all usable right now. */
  const dockerReady = $derived(
    status?.docker.cli.state === "found" &&
      status.docker.compose.state === "found" &&
      status.docker.engine.state === "running",
  );

  // "Start ArboDat+ when this app opens": once, as soon as Docker is ready and ArboDat+ is
  // installed but stopped. What the user does afterwards (a Stop, say) is never undone.
  let autoStartDone = false;
  $effect(() => {
    if (autoStartDone || !status || !settings || operation.running) return;
    if (!settings.autoStart || performance.now() > AUTO_START_WINDOW_MS) {
      autoStartDone = true;
      return;
    }
    if (status.stack.phase === "running") {
      autoStartDone = true;
    } else if (status.stack.phase === "stopped" && dockerReady) {
      autoStartDone = true;
      void autoStart();
    } else if (status.stack.phase !== "engineUnavailable") {
      // Not installed (nothing to start), or something needs the user's attention: not ours to
      // start. Only a Docker that isn't up yet is worth waiting for.
      autoStartDone = true;
    }
  });

  async function autoStart() {
    await operation.run("start", refreshAfterOperation);
    if (operation.error) return;
    try {
      await openArbodat();
    } catch (e) {
      operation.notice = String(e);
    }
  }

  // Poll while the window is visible; the next poll starts only after the last one ended.
  onMount(() => {
    // The backend refuses to close the window while installing/starting/stopping; say why.
    const unlisten = onCloseBlocked(() => {
      operation.notice = "ArboDat+ is still working, so the window stays open. You can close it as soon as it has finished.";
    });
    getSettings().then((s) => (settings = s)).catch((e) => (error = String(e)));
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await refresh();
      timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unlisten.then((stop) => stop());
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

  <OperationPanel />

  {#if error}
    <section><div class="hint bad">Couldn't check the status: <pre>{error}</pre></div></section>
  {/if}

  {#if status}
    <DockerPanel docker={status.docker} />
    <StackPanel stack={status.stack} appVersion={status.appVersion} {dockerReady} afterOperation={refreshAfterOperation} />
    {#if settings}
      <SettingsPanel
        {settings}
        stack={status.stack}
        {dockerReady}
        afterOperation={refreshAfterOperation}
        onSettings={(s) => (settings = s)}
      />
    {/if}
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
