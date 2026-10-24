<script lang="ts">
  import { onMount } from "svelte";
  import { asAppError, getSettings, getStatus, onCloseBlocked, openArbodat, serverStatus } from "./lib/api";
  import type { ServerStatus } from "./lib/bindings/ServerStatus";
  import type { SettingsView } from "./lib/bindings/SettingsView";
  import type { Status } from "./lib/bindings/Status";
  import CogButton from "./lib/components/CogButton.svelte";
  import DockerPanel from "./lib/components/DockerPanel.svelte";
  import OperationPanel from "./lib/components/OperationPanel.svelte";
  import ServerForm from "./lib/components/ServerForm.svelte";
  import ServerPanel from "./lib/components/ServerPanel.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import StackPanel from "./lib/components/StackPanel.svelte";
  import { operation } from "./lib/operation.svelte";

  const POLL_MS = 15_000;

  // Long enough to be noticed when the check itself is instant.
  const MIN_FEEDBACK_MS = 1500;

  /** Docker Desktop can take minutes to come up when the computer has just started. */
  const AUTO_START_WINDOW_MS = 5 * 60_000;

  let status = $state<Status | null>(null);
  let server = $state<ServerStatus | null>(null);
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
        // Which mode we are in decides what to ask: in server mode Docker is none of our business.
        if (!settings) return;
        if (settings.mode === "server") server = await serverStatus();
        else status = await getStatus();
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

  // --- The card: slides in from the right, closes with the cog turned "x" ----------------------
  const SLIDE_MS = 240;

  /** False for the first frame, so the card has something to slide in from. */
  let entered = $state(false);
  let leaving = $state(false);

  // The cog in the ArboDat+ page and this "x" share one place: 10 px from the top and, as if
  // there were always a scrollbar, 10 px left of where it would be (see shims.js). The card has its
  // own scrollbar, so the offset is worked out the same way.
  let card = $state<HTMLDivElement>();
  let cogRight = $state(10);
  function placeCog(barWidth: number) {
    if (!card) return;
    const showing = card.offsetWidth - card.clientWidth;
    cogRight = 10 + Math.max(0, barWidth - showing);
  }
  function measureScrollbar(): number {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;width:60px;height:60px;overflow:scroll";
    document.body.appendChild(probe);
    const width = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return width;
  }

  /**
   * ArboDat+ (or a server) is set up, so there is something to go back to. Until then the
   * Control Center is all there is and can't be closed.
   */
  const setUp = $derived(
    settings?.mode === "server"
      ? !!settings.serverUrl
      : !!status && status.stack.phase !== "notInstalled",
  );
  /**
   * There is a running ArboDat+ to go back to. (A server is offered even if it is down right now,
   * the x then says why it can't be opened.) A stopped local one isn't: no x until it runs.
   */
  const canClose = $derived(
    setUp && (settings?.mode === "server" || status?.stack.phase === "running"),
  );
  const working = $derived(operation.running !== null || status?.stack.phase === "busy");

  async function closeControlCenter() {
    if (leaving || working) return;
    leaving = true;
    await new Promise((r) => setTimeout(r, SLIDE_MS));
    try {
      // Navigates this window to ArboDat+ (the page it showed before, if any).
      await openArbodat();
    } catch (e) {
      // It isn't answering (stopped, server down...): stay, and say why.
      leaving = false;
      operation.error = asAppError(e);
    }
  }

  /** The mode changed: forget what we knew about the other one and look again. */
  function onSettings(next: SettingsView) {
    const modeChanged = settings?.mode !== next.mode;
    settings = next;
    if (modeChanged) {
      status = null;
      server = null;
      operation.error = null;
      void refresh();
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
    if (autoStartDone || !status || settings?.mode !== "local" || operation.running) return;
    if (!settings?.autoStart || performance.now() > AUTO_START_WINDOW_MS) {
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
    requestAnimationFrame(() => (entered = true));
    const barWidth = measureScrollbar();
    const observer = new ResizeObserver(() => placeCog(barWidth));
    if (card) {
      observer.observe(card);
      if (card.firstElementChild) observer.observe(card.firstElementChild);
    }
    placeCog(barWidth);
    // The backend refuses to close the window while installing/starting/stopping; say why.
    const unlisten = onCloseBlocked(() => {
      operation.notice = "ArboDat+ is still working, so the window stays open. You can close it as soon as it has finished.";
    });
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!document.hidden) await refresh();
      timer = setTimeout(loop, POLL_MS);
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    // The settings say what to poll, so they come first.
    getSettings()
      .then((s) => (settings = s))
      .catch((e) => (error = String(e)))
      .finally(loop);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      observer.disconnect();
      unlisten.then((stop) => stop());
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<div class="stage">
  <div class="card" class:entered class:leaving bind:this={card}>
    <main>
      <header>
        <h1>Control Center</h1>
        {#if canClose}
          <CogButton closing={entered && !leaving} right={cogRight} disabled={working} onclick={closeControlCenter} />
        {/if}
      </header>

  <OperationPanel />

  {#if error}
    <section><div class="hint bad">Couldn't check the status: <pre>{error}</pre></div></section>
  {/if}

  {#if settings?.mode === "server"}
    <ServerPanel {settings} {server} {onSettings} />
  {:else if status}
    <DockerPanel docker={status.docker} />
    <StackPanel stack={status.stack} appVersion={status.appVersion} {dockerReady} afterOperation={refreshAfterOperation} />
    {#if settings}
      <SettingsPanel
        {settings}
        stack={status.stack}
        {dockerReady}
        afterOperation={refreshAfterOperation}
        {onSettings}
      />
      <section>
        <h2>Use a server instead</h2>
        <p class="muted">
          If your institute runs ArboDat+ on a server, enter its address to work there.<br />
          ArboDat+ on this computer stays installed as it is.
        </p>
        <ServerForm
          initial={settings.serverUrl ?? ""}
          disabled={operation.running !== null || status.stack.phase === "busy"}
          onConnected={onSettings}
        />
      </section>
    {/if}
  {:else if !error}
    <section><p class="muted">Checking…</p></section>
  {/if}

  <footer>
    <button onclick={checkAgain} disabled={userChecking}>{userChecking ? "Checking…" : "Check again"}</button>
    {#if checkedAt}<span class="muted">Last checked {checkedAt.toLocaleTimeString()}</span>{/if}
  </footer>
    </main>
  </div>
</div>

<style>
  /* The Control Center is a card at the right edge over a dimmed backdrop. (The ArboDat+ page
     isn't kept alive behind it; see windows/arbodat.rs.) */
  .stage {
    position: fixed;
    inset: 0;
    background: #121315;
    animation: dim 0.3s ease both;
  }
  .card {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(720px, 100vw);
    overflow-y: auto;
    background: var(--bg);
    box-shadow: -14px 0 44px rgba(0, 0, 0, 0.5);
    transform: translateX(100%);
    transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .card.entered { transform: translateX(0); }
  .card.leaving { transform: translateX(100%); transition-duration: 0.22s; transition-timing-function: ease-in; }
  @keyframes dim { from { background: #000; } to { background: #121315; } }
  @media (prefers-reduced-motion: reduce) {
    .card, .card.leaving { transition: none; }
    .stage { animation: none; }
  }

  header { display: flex; align-items: center; gap: 12px; }
  header { padding-right: 56px; }
  header h1 { margin-right: auto; }
  header h1 { white-space: nowrap; }
  footer { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
</style>
