<script lang="ts">
  import type { Operation } from "../bindings/Operation";
  import type { ServiceStatus } from "../bindings/ServiceStatus";
  import type { StackPhase } from "../bindings/StackPhase";
  import type { StackStatus } from "../bindings/StackStatus";
  import { openLink } from "../api";
  import { operation } from "../operation.svelte";

  let {
    stack,
    appVersion,
    dockerReady,
    afterOperation,
  }: {
    stack: StackStatus;
    appVersion: string;
    /** Docker, Compose and the engine are all usable right now. */
    dockerReady: boolean;
    /** Refreshes the status once an operation has ended. */
    afterOperation: () => Promise<void>;
  } = $props();

  type Tone = "ok" | "warn" | "bad" | "muted";
  const phases: Record<StackPhase, { label: string; tone: Tone }> = {
    notInstalled: { label: "Not installed", tone: "muted" },
    engineUnavailable: { label: "Waiting for Docker", tone: "warn" },
    wrongEngine: { label: "Installation not found in this Docker", tone: "bad" },
    volumeMissing: { label: "Database not found in this Docker", tone: "bad" },
    newerThanApp: { label: "Installed by a newer ArboDat+", tone: "warn" },
    stopped: { label: "Stopped", tone: "muted" },
    starting: { label: "Starting…", tone: "warn" },
    running: { label: "Running", tone: "ok" },
    degraded: { label: "Not running correctly", tone: "bad" },
    busy: { label: "Working…", tone: "warn" },
    unknown: { label: "Status unknown", tone: "bad" },
  };
  const busyLabels: Record<Operation, string> = { install: "Installing…", start: "Starting…", stop: "Stopping…" };

  const serviceNames: Record<string, string> = { database: "Database", "web-api": "Web API", frontend: "Web interface" };

  function describe(s: ServiceStatus): { text: string; tone: string } {
    if (s.state === "running") {
      if (s.health === "unhealthy") return { text: "running, unhealthy", tone: "bad" };
      if (s.health === "starting") return { text: "starting", tone: "warn" };
      return { text: "running", tone: "ok" };
    }
    if (s.state === "missing") return { text: "not created", tone: "muted" };
    if (s.state === "exited") return { text: s.exitCode ? `stopped (exit code ${s.exitCode})` : "stopped", tone: s.exitCode ? "bad" : "muted" };
    if (s.state === "restarting") return { text: "restarting repeatedly", tone: "bad" };
    return { text: s.state, tone: "warn" };
  }

  const busy = $derived(stack.phase === "busy" || operation.running !== null);
  const shown = $derived.by(() => {
    const running = operation.running ?? stack.operation;
    return stack.phase === "busy" && running ? { label: busyLabels[running], tone: "warn" as Tone } : phases[stack.phase];
  });
  const canStart = $derived(stack.phase === "stopped" || stack.phase === "degraded");
  const canStop = $derived(["starting", "running", "degraded", "newerThanApp"].includes(stack.phase));
  // The trailing slash matters: the opener plugin checks the URL as a literal string against its scope.
  const url = $derived(stack.port ? `http://127.0.0.1:${stack.port}/` : null);

  const run = (op: Operation) => operation.run(op, afterOperation);

  async function openInBrowser() {
    if (!url) return;
    try {
      await openLink(url);
    } catch (e) {
      // Never let a button fail silently.
      operation.notice = `ArboDat+ couldn't open your browser (${e}). You can open ${url} yourself.`;
    }
  }
</script>

<section>
  <h2>ArboDat+ on this computer</h2>

  <p class="phase {shown.tone}">{shown.label}</p>

  {#if stack.installedVersion}
    <p class="muted">Installed version {stack.installedVersion}</p>
  {/if}

  {#if stack.phase === "notInstalled"}
    <p class="muted">ArboDat+ hasn't been set up on this computer yet. The first installation downloads about 400 MB.</p>
  {:else if stack.phase === "engineUnavailable"}
    <p class="muted">Start Docker to see whether ArboDat+ is running.</p>
  {:else if stack.phase === "wrongEngine"}
    <div class="hint bad">
      ArboDat+ was installed with a different Docker installation (for example before Docker Desktop was
      reset, or in another Docker context). Its data isn't available in the current one.
    </div>
  {:else if stack.phase === "volumeMissing"}
    <div class="hint bad">
      ArboDat+'s database isn't in this Docker any more, for example because Docker Desktop was reset.
      ArboDat+ won't create a new, empty one on its own, because that would look like data loss.
    </div>
  {:else if stack.phase === "newerThanApp"}
    <div class="hint">
      This installation was last updated by a newer version of the ArboDat+ app than this one
      ({appVersion}). Please install the newest app.
    </div>
  {:else if stack.phase === "unknown"}
    <div class="hint bad">The status couldn't be determined:<pre>{stack.detail}</pre></div>
  {/if}

  {#if stack.updateAvailable}
    <div class="hint">An update to version {appVersion} is available.</div>
  {/if}

  {#if stack.services.length}
    <ul>
      {#each stack.services as s (s.name)}
        {@const d = describe(s)}
        <li><span>{serviceNames[s.name] ?? s.name}</span><span class={d.tone}>{d.text}</span></li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    {#if stack.phase === "notInstalled"}
      <button class="primary" disabled={busy || !dockerReady} onclick={() => run("install")}>Install ArboDat+</button>
    {/if}
    {#if canStart}
      <button class="primary" disabled={busy || !dockerReady} onclick={() => run("start")}>Start</button>
    {/if}
    {#if stack.phase === "running" && url}
      <button class="primary" onclick={openInBrowser}>Open ArboDat+ in the browser</button>
    {/if}
    {#if canStop}
      <button disabled={busy || !dockerReady} onclick={() => run("stop")}>Stop</button>
    {/if}
    {#if stack.phase === "notInstalled" && !dockerReady}
      <span class="muted small">Docker has to be running first.</span>
    {/if}
  </div>
</section>

<style>
  .phase { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .phase.muted { color: var(--text); }
  p { margin: 4px 0; }
  .small { font-size: 13px; }
  ul { list-style: none; margin: 12px 0 0; padding: 0; }
  li { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--border); }
</style>
