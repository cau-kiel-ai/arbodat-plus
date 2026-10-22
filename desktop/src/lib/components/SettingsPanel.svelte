<script lang="ts">
  import { asAppError, chooseBackupFolder, resetBackupFolder, setAutoStart } from "../api";
  import type { SettingsView } from "../bindings/SettingsView";
  import type { StackStatus } from "../bindings/StackStatus";
  import { operation } from "../operation.svelte";

  const MIN_PORT = 1024;
  const MAX_PORT = 65535;

  let {
    settings,
    stack,
    dockerReady,
    afterOperation,
    onSettings,
  }: {
    settings: SettingsView;
    stack: StackStatus;
    /** Docker, Compose and the engine are all usable right now. */
    dockerReady: boolean;
    /** Refreshes the status once an operation has ended. */
    afterOperation: () => Promise<void>;
    onSettings: (settings: SettingsView) => void;
  } = $props();

  const busy = $derived(stack.phase === "busy" || operation.running !== null);

  /** Report a failed settings change where the user will see it. */
  function failed(e: unknown) {
    operation.error = asAppError(e);
  }

  async function toggleAutoStart(enabled: boolean) {
    try {
      onSettings(await setAutoStart(enabled));
    } catch (e) {
      failed(e);
    }
  }

  async function pickBackupFolder() {
    try {
      const chosen = await chooseBackupFolder();
      if (chosen) onSettings(chosen);
    } catch (e) {
      failed(e);
    }
  }

  async function useDefaultBackupFolder() {
    try {
      onSettings(await resetBackupFolder());
    } catch (e) {
      failed(e);
    }
  }

  // --- Port --------------------------------------------------------------------------------
  let portText = $state("");
  let portEdited = $state(false);
  // Follow the installation's port until the user starts typing.
  $effect(() => {
    if (!portEdited && stack.port != null) portText = String(stack.port);
  });
  const requestedPort = $derived(/^\d{1,5}$/.test(portText.trim()) ? Number(portText.trim()) : null);
  const portValid = $derived(requestedPort !== null && requestedPort >= MIN_PORT && requestedPort <= MAX_PORT);
  const portChanged = $derived(portValid && requestedPort !== stack.port);
  /** The stack can be moved while it is stopped, running or limping, not while it is unusable. */
  const canChangePort = $derived(["stopped", "running", "degraded"].includes(stack.phase));

  async function changePort() {
    if (!portChanged || requestedPort === null) return;
    await operation.run("changePort", afterOperation, { port: requestedPort });
    portEdited = false;
  }

  // --- Removing ----------------------------------------------------------------------------
  let confirmingRemove = $state(false);
  const canRemove = $derived(["stopped", "running", "degraded", "wrongEngine", "volumeMissing"].includes(stack.phase));
  /** Docker no longer has the database: removing then means a new, empty one at the next install. */
  const databaseGone = $derived(stack.phase === "wrongEngine" || stack.phase === "volumeMissing");

  async function remove() {
    confirmingRemove = false;
    await operation.run("remove", afterOperation);
  }
</script>

<section>
  <h2>Settings</h2>

  <label class="row">
    <input
      type="checkbox"
      checked={settings.autoStart}
      onchange={(e) => toggleAutoStart(e.currentTarget.checked)}
    />
    <span>Start ArboDat+ when this app opens</span>
  </label>

  {#if stack.port != null}
    <div class="setting">
      <label for="port">Port</label>
      <div class="inline">
        <input
          id="port"
          type="text"
          inputmode="numeric"
          size="6"
          bind:value={portText}
          oninput={() => (portEdited = true)}
          disabled={busy || !canChangePort}
        />
        <button disabled={busy || !dockerReady || !canChangePort || !portChanged} onclick={changePort}>
          Change port
        </button>
      </div>
      {#if portText.trim() !== "" && !portValid}
        <p class="small bad">Please enter a number between {MIN_PORT} and {MAX_PORT}.</p>
      {:else}
        <p class="muted small">
          ArboDat+ answers at <code>http://127.0.0.1:{stack.port}/</code> on this computer only. If it is
          running, it restarts briefly on the new port.
        </p>
      {/if}
    </div>
  {/if}

  <div class="setting">
    <span class="label">Backup folder</span>
    <p class="path"><code>{settings.backupFolder}</code></p>
    <div class="inline">
      <button disabled={busy} onclick={pickBackupFolder}>Choose…</button>
      {#if !settings.backupFolderIsDefault}
        <button disabled={busy} onclick={useDefaultBackupFolder}>Use the default folder</button>
      {/if}
    </div>
    <p class="muted small">Backups are saved here.</p>
  </div>

  {#if stack.installedVersion && canRemove}
    <div class="setting">
      <span class="label">Remove ArboDat+</span>
      {#if !confirmingRemove}
        <div class="inline">
          <button disabled={busy || !dockerReady} onclick={() => (confirmingRemove = true)}>
            Remove ArboDat+ from Docker…
          </button>
        </div>
        <p class="muted small">
          Removes ArboDat+'s containers. Your data, your backups and the downloaded program parts are
          kept, and installing again picks your data up.
        </p>
      {:else}
        <div class="hint {databaseGone ? 'bad' : ''}">
          {#if databaseGone}
            <strong>ArboDat+'s database is not in this Docker.</strong> Removing ArboDat+ lets you install
            it again, which creates a <strong>new, empty database</strong>. Backups on your computer stay
            untouched.
          {:else}
            <strong>Remove ArboDat+ from Docker?</strong> ArboDat+ stops working until you install it
            again. Your data, backups and the database password file are kept.
          {/if}
        </div>
        <div class="actions">
          <button class="danger" disabled={busy} onclick={remove}>Remove</button>
          <button onclick={() => (confirmingRemove = false)}>Cancel</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .row { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .setting { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border); }
  .setting > label, .label { display: block; font-weight: 600; margin-bottom: 6px; }
  .inline { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .small { font-size: 13px; margin: 6px 0 0; }
  .path { margin: 0 0 8px; overflow-wrap: anywhere; }
  input[type="text"] { font: inherit; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
  button.danger { background: var(--bad); border-color: var(--bad); color: #fff; font-weight: 600; }
</style>
