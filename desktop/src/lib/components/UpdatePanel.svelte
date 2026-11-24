<script lang="ts">
  import type { StackStatus } from "../bindings/StackStatus";
  import { operation } from "../operation.svelte";
  import { updateChoice } from "../update.svelte";

  let {
    stack,
    appVersion,
    dockerReady,
    afterOperation,
    onLater,
  }: {
    stack: StackStatus;
    appVersion: string;
    /** Docker, Compose and the engine are all usable right now. */
    dockerReady: boolean;
    /** Refreshes the status once an operation has ended. */
    afterOperation: () => Promise<void>;
    /** "Later": hide the question until the next start (and go to ArboDat+ if it runs). */
    onLater: () => void;
  } = $props();

  const busy = $derived(stack.phase === "busy" || operation.running !== null);
  const canUpdate = $derived(["running", "stopped", "degraded"].includes(stack.phase));
  let confirmingBack = $state(false);

  function update(retry: boolean) {
    confirmingBack = false;
    return operation.run("update", afterOperation, { retry });
  }

  function goBack() {
    confirmingBack = false;
    return operation.run("rollBack", afterOperation);
  }
</script>

{#if stack.recovery}
  {@const r = stack.recovery}
  <section>
    <h2>Update</h2>
    <div class="hint bad">
      <strong>The update from {r.fromVersion} to {r.toVersion} didn't finish.</strong><br />
      ArboDat+ is between the two versions.
      {#if r.stage === "switched"}Try the update again, or go back to version {r.fromVersion}.{/if}
      {#if r.stage === "rollingBack"}Going back to version {r.fromVersion} was interrupted: go back again.{/if}
    </div>
    {#if !confirmingBack}
      <div class="actions">
        {#if r.stage === "switched"}
          <button class="primary" disabled={busy || !dockerReady} onclick={() => update(true)}>Try again</button>
        {/if}
        <button class="danger-hover" disabled={busy || !dockerReady} onclick={() => (confirmingBack = true)}>
          Go back to version {r.fromVersion}
        </button>
      </div>
    {:else}
      <div class="hint bad">
        <strong>Go back to version {r.fromVersion}?</strong><br />
        The data from before the update is restored{r.backup ? ` from the backup ${r.backup}` : ""}.<br />
        Anything entered since the update is not kept here; it is saved in a "before restore" backup first.
      </div>
      <div class="actions">
        <button class="danger" disabled={busy || !dockerReady} onclick={goBack}>Go back</button>
        <button onclick={() => (confirmingBack = false)}>Cancel</button>
      </div>
    {/if}
  </section>
{:else if stack.updateAvailable && !updateChoice.later && canUpdate}
  <section>
    <h2>Update</h2>
    <div class="hint">An update to a new version is available.</div>
    <dl class="versions">
      <dt>New version:</dt>
      <dd class="mono">{appVersion}</dd>
      <dt>Installed version:</dt>
      <dd class="mono">{stack.installedVersion}</dd>
    </dl>
    <p class="muted small">
      Updating makes a backup first, downloads the new version and restarts ArboDat+.<br />
      If the new version doesn't work, you can go back to the current one.
    </p>
    <div class="actions">
      <button class="primary" disabled={busy || !dockerReady} onclick={() => update(false)}>Update now</button>
      <button disabled={busy} onclick={onLater}>Later</button>
    </div>
  </section>
{/if}

<style>
  p { margin: 4px 0; }
  .versions { display: grid; grid-template-columns: max-content auto; column-gap: 12px; row-gap: 2px; margin: 12px 0 4px; }
  .versions dd { margin: 0; align-self: baseline; }
  .small { font-size: 13px; margin-top: 8px; }
  .hint + .hint { margin-top: 10px; }
  button.danger { background: var(--bad); border-color: var(--bad); color: #fff; font-weight: 600; }
</style>
