<script lang="ts">
  import type { Operation } from "../bindings/Operation";
  import { operation, operationTitles } from "../operation.svelte";

  const doneMessages: Record<Operation, string> = {
    install: "ArboDat+ is installed and running.",
    start: "ArboDat+ is running.",
    stop: "ArboDat+ is stopped. Your data is kept.",
    changePort: "ArboDat+ now uses the new port.",
    remove: "ArboDat+ was removed from Docker. Your data is kept.",
  };

  let logElement = $state<HTMLPreElement>();
  let copied = $state(false);

  // Keep the newest output in view while it grows.
  $effect(() => {
    operation.log.length;
    if (logElement) logElement.scrollTop = logElement.scrollHeight;
  });

  async function copyDetails() {
    const error = operation.error;
    if (!error) return;
    await navigator.clipboard.writeText([error.message, error.detail].filter(Boolean).join("\n\n"));
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

{#if operation.running}
  <section>
    <h2>{operationTitles[operation.running]}</h2>
    {#if operation.step}
      <p class="step">Step {operation.step.index} of {operation.step.total}: {operation.step.label}</p>
      <progress max={operation.step.total} value={operation.step.index}></progress>
    {:else}
      <p class="step muted">Getting started…</p>
    {/if}
    <p class="muted small">Please keep this window open until it has finished.</p>
    {#if operation.log.length}
      <details open>
        <summary>Details</summary>
        <pre class="log" bind:this={logElement}>{operation.log.join("\n")}</pre>
      </details>
    {/if}
  </section>
{:else if operation.error}
  <section>
    <h2>That didn't work</h2>
    <div class="hint bad">
      <strong>{operation.error.message}</strong>
      {#if operation.error.detail}
        <details>
          <summary>Technical details</summary>
          <pre>{operation.error.detail}</pre>
        </details>
      {/if}
    </div>
    <div class="actions">
      {#if operation.error.detail}<button onclick={copyDetails}>{copied ? "Copied" : "Copy details"}</button>{/if}
      <button onclick={() => operation.dismissError()}>Dismiss</button>
    </div>
  </section>
{:else if operation.succeeded}
  <section>
    <p class="ok done">✓ {doneMessages[operation.succeeded]}</p>
  </section>
{/if}

{#if operation.notice}
  <section>
    <div class="hint notice">
      <span>{operation.notice}</span>
      <button class="link" onclick={() => (operation.notice = null)}>Dismiss</button>
    </div>
  </section>
{/if}

<style>
  .step { margin: 4px 0 8px; font-weight: 600; }
  .small { font-size: 13px; margin: 8px 0 0; }
  .done { margin: 0; font-weight: 600; }
  .notice { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin-top: 0; }
  progress { width: 100%; height: 10px; accent-color: var(--accent); }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: var(--muted); }
  .log { max-height: 200px; overflow: auto; padding: 8px 10px; border-radius: 6px; background: color-mix(in srgb, var(--text) 6%, transparent); }
</style>
