<script lang="ts">
  import { asAppError, openArbodat, openServerInBrowser, useLocalMode } from "../api";
  import type { ServerStatus } from "../bindings/ServerStatus";
  import type { SettingsView } from "../bindings/SettingsView";
  import { operation } from "../operation.svelte";
  import ServerForm from "./ServerForm.svelte";

  let {
    settings,
    server,
    onSettings,
  }: {
    settings: SettingsView;
    /** The latest check of the server; `null` until the first one is done. */
    server: ServerStatus | null;
    onSettings: (settings: SettingsView) => void;
  } = $props();

  let changing = $state(false);

  async function open() {
    try {
      await openArbodat();
    } catch (e) {
      operation.error = asAppError(e);
    }
  }

  async function openInBrowser() {
    try {
      await openServerInBrowser();
    } catch (e) {
      operation.error = asAppError(e);
    }
  }

  async function backToLocal() {
    try {
      onSettings(await useLocalMode());
    } catch (e) {
      operation.error = asAppError(e);
    }
  }
</script>

<section>
  <h2>ArboDat+ on a server</h2>

  <p class="address"><code>{settings.serverUrl}</code></p>
  {#if !server}
    <p class="muted">Checking the server…</p>
  {:else if server.reachable}
    <p class="ok">✓ The server answers.</p>
  {:else}
    <div class="hint bad">
      <strong>{server.problem}</strong>
      {#if server.detail}
        <details>
          <summary>Technical details</summary>
          <pre>{server.detail}</pre>
        </details>
      {/if}
    </div>
  {/if}

  {#if changing}
    <h3>Another server</h3>
    <ServerForm
      initial={settings.serverUrl ?? ""}
      label="Connect"
      onConnected={(s) => { changing = false; onSettings(s); }}
      onCancel={() => (changing = false)}
    />
  {:else}
    <div class="actions">
      <button class="primary" disabled={!server?.reachable} onclick={open}>Open ArboDat+</button>
      <button onclick={openInBrowser}>Open in Browser</button>
    </div>
    <div class="actions apart column">
      <button onclick={() => (changing = true)}>Use another Server</button>
      <button onclick={backToLocal}>Use ArboDat+ on this Computer</button>
    </div>
  {/if}

  <p class="muted small">
    Backups, updates and access are managed by whoever runs the server. The ArboDat+ you installed on
    this computer, if any, is left as it is.
  </p>
</section>

<style>
  .address { margin: 0 0 8px; overflow-wrap: anywhere; }
  .apart { margin-top: 28px; }
  .column { flex-direction: column; align-items: flex-start; gap: 10px; }
  h3 { font-size: 14px; margin: 18px 0 8px; }
  .small { font-size: 13px; margin: 14px 0 0; }
</style>
