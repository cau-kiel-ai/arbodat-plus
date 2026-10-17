<script lang="ts">
  import type { StackPhase } from "../bindings/StackPhase";
  import type { StackStatus } from "../bindings/StackStatus";
  import type { ServiceStatus } from "../bindings/ServiceStatus";

  let { stack, appVersion }: { stack: StackStatus; appVersion: string } = $props();

  const phases: Record<StackPhase, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
    notInstalled: { label: "Not installed", tone: "muted" },
    engineUnavailable: { label: "Waiting for Docker", tone: "warn" },
    wrongEngine: { label: "Installation not found in this Docker", tone: "bad" },
    newerThanApp: { label: "Installed by a newer ArboDat+", tone: "warn" },
    stopped: { label: "Stopped", tone: "muted" },
    starting: { label: "Starting…", tone: "warn" },
    running: { label: "Running", tone: "ok" },
    degraded: { label: "Not running correctly", tone: "bad" },
    unknown: { label: "Status unknown", tone: "bad" },
  };

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

  const phase = $derived(phases[stack.phase]);
</script>

<section>
  <h2>ArboDat+ on this computer</h2>

  <p class="phase {phase.tone}">{phase.label}</p>

  {#if stack.installedVersion}
    <p class="muted">Installed version {stack.installedVersion}</p>
  {/if}

  {#if stack.phase === "notInstalled"}
    <p class="muted">ArboDat+ hasn't been set up on this computer yet.</p>
  {:else if stack.phase === "engineUnavailable"}
    <p class="muted">Start Docker to see whether ArboDat+ is running.</p>
  {:else if stack.phase === "wrongEngine"}
    <div class="hint bad">
      ArboDat+ was installed with a different Docker installation (for example before Docker Desktop was
      reset, or in another Docker context). Its data isn't available in the current one.
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
</section>

<style>
  .phase { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .phase.muted { color: var(--text); }
  p { margin: 4px 0; }
  ul { list-style: none; margin: 12px 0 0; padding: 0; }
  li { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--border); }
</style>
