<script lang="ts">
  import { openLink, platform } from "../api";
  import type { DockerStatus } from "../bindings/DockerStatus";

  let { docker }: { docker: DockerStatus } = $props();

  const installDocs: Record<typeof platform, string> = {
    macos: "https://docs.docker.com/desktop/setup/install/mac-install/",
    windows: "https://docs.docker.com/desktop/setup/install/windows-install/",
    linux: "https://docs.docker.com/engine/install/",
  };

  const cliOk = $derived(docker.cli.state === "found");
  const composeOk = $derived(docker.compose.state === "found");
  const engineOk = $derived(docker.engine.state === "running");
</script>

<section>
  <h2>Docker</h2>

  <dl>
    <dt>Docker</dt>
    <dd>
      {#if docker.cli.state === "found"}
        <span class="ok">✓</span> {docker.cli.version ?? "installed"}
        <span class="muted">· {docker.cli.path}</span>
      {:else if docker.cli.state === "unsupported"}
        <span class="bad">✕</span> unsupported installation
        <span class="muted">· {docker.cli.path}</span>
      {:else}
        <span class="bad">✕</span> not found
      {/if}
    </dd>

    <dt>Docker Compose</dt>
    <dd>
      {#if docker.compose.state === "found"}
        <span class="ok">✓</span> {docker.compose.version}
      {:else if docker.compose.state === "tooOld"}
        <span class="bad">✕</span> {docker.compose.version} (needs {docker.compose.minimum} or newer)
      {:else if docker.compose.state === "missing"}
        <span class="bad">✕</span> not available
      {:else}
        <span class="muted">—</span>
      {/if}
    </dd>

    <dt>Docker engine</dt>
    <dd>
      {#if docker.engine.state === "running"}
        <span class="ok">✓</span> running · {docker.engine.os} {docker.engine.version}
      {:else if docker.engine.state === "notRunning"}
        <span class="warn">●</span> not running
      {:else if docker.engine.state === "permissionDenied"}
        <span class="bad">✕</span> no permission
      {:else if docker.engine.state === "error"}
        <span class="bad">✕</span> error
      {:else}
        <span class="muted">—</span>
      {/if}
    </dd>
  </dl>

  {#if docker.cli.state === "notFound"}
    <div class="hint">
      ArboDat+ runs on this computer with Docker{platform === "linux" ? "" : " Desktop"}, which isn't
      installed yet. Install it, start it once, then check again.
      <br /><button class="link" onclick={() => openLink(installDocs[platform])}>How to install Docker</button>
    </div>
  {:else if docker.cli.state === "unsupported"}
    <div class="hint bad">
      {docker.cli.reason}
      <br /><button class="link" onclick={() => openLink(installDocs[platform])}>How to install Docker</button>
    </div>
  {:else if cliOk && !composeOk}
    <div class="hint bad">
      ArboDat+ needs the Docker Compose plugin (v2.21 or newer).
      {#if docker.compose.state === "missing" && docker.compose.detail}<pre>{docker.compose.detail}</pre>{/if}
      <button class="link" onclick={() => openLink("https://docs.docker.com/compose/install/")}>How to install Docker Compose</button>
    </div>
  {:else if docker.engine.state === "notRunning"}
    <div class="hint">
      Docker is installed but not running.
      {platform === "linux" ? "Start the Docker service" : "Start Docker Desktop"}, wait until it's ready, then check again.
    </div>
  {:else if docker.engine.state === "permissionDenied"}
    <div class="hint bad">
      Your user account isn't allowed to use Docker. Add it to the <code>docker</code> group with
      <code>sudo usermod -aG docker $USER</code>, then log out and back in.
      <br /><button class="link" onclick={() => openLink("https://docs.docker.com/engine/install/linux-postinstall/")}>Docker's instructions</button>
    </div>
  {:else if docker.engine.state === "error"}
    <div class="hint bad">Docker reported an error:<pre>{docker.engine.detail}</pre></div>
  {/if}

  {#if cliOk && composeOk && engineOk}
    <p class="muted small">Docker is ready.</p>
  {/if}
</section>

<style>
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .small { margin: 12px 0 0; font-size: 13px; }
</style>
