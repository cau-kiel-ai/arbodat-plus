<script lang="ts">
  import { asAppError, connectServer } from "../api";
  import type { AppError } from "../bindings/AppError";
  import type { SettingsView } from "../bindings/SettingsView";

  let {
    initial = "",
    label = "Connect",
    disabled = false,
    onConnected,
    onCancel,
  }: {
    initial?: string;
    label?: string;
    disabled?: boolean;
    /** The server was saved and its ArboDat+ window is opening. */
    onConnected: (settings: SettingsView) => void;
    onCancel?: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally -- the field starts with the given address and is the user's from then on
  let address = $state(initial);
  let working = $state(false);
  let problem = $state<AppError | null>(null);

  /** The server answered badly, but the user may know better (e.g. it is still starting up). */
  const canForce = $derived(problem?.code === "serverUnreachable" || problem?.code === "notArbodat");

  async function connect(force: boolean) {
    working = true;
    problem = null;
    try {
      onConnected(await connectServer(address, force));
    } catch (e) {
      problem = asAppError(e);
    } finally {
      working = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); connect(false); }}>
  <div class="inline">
    <input
      type="text"
      placeholder="https://arbodat.example.org/"
      aria-label="Address of the ArboDat+ server"
      bind:value={address}
      oninput={() => (problem = null)}
      disabled={working}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
    />
    <button class="primary" type="submit" disabled={disabled || working || address.trim() === ""}>
      {working ? "Checking…" : label}
    </button>
    {#if onCancel}<button type="button" disabled={working} onclick={onCancel}>Cancel</button>{/if}
  </div>

  {#if problem}
    <div class="hint bad">
      <strong>{problem.message}</strong>
      {#if problem.detail}
        <details>
          <summary>Technical details</summary>
          <pre>{problem.detail}</pre>
        </details>
      {/if}
      {#if canForce}
        <div class="actions">
          <button type="button" disabled={working} onclick={() => connect(true)}>Use this address anyway</button>
        </div>
      {/if}
    </div>
  {/if}
</form>

<style>
  .inline { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  input { flex: 1 1 280px; min-width: 0; font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
</style>
