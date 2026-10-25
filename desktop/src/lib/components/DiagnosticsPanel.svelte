<script lang="ts">
  import { asAppError, getDiagnostics } from "../api";
  import type { AppError } from "../bindings/AppError";

  let report = $state<string | null>(null);
  let working = $state(false);
  let failure = $state<AppError | null>(null);
  let copied = $state(false);
  let reportElement = $state<HTMLPreElement>();

  async function create() {
    working = true;
    failure = null;
    copied = false;
    try {
      report = await getDiagnostics();
    } catch (e) {
      failure = asAppError(e);
    } finally {
      working = false;
    }
  }

  async function copy() {
    if (report === null) return;
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      // No clipboard access: select the text instead, so ⌘C / Ctrl+C still works.
      const range = document.createRange();
      if (reportElement) {
        range.selectNodeContents(reportElement);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return;
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<section>
  <h2>Diagnostics</h2>
  <p class="muted">
    A report about this app, Docker and ArboDat+, with the recent logs, to copy into a message when you
    ask for help. The database password is left out.
  </p>

  <div class="actions">
    <button disabled={working} onclick={create}>{working ? "Collecting…" : report === null ? "Create Report" : "Create new Report"}</button>
    {#if report !== null}
      <button onclick={copy}>{copied ? "Copied" : "Copy Report"}</button>
      <button class="link" onclick={() => (report = null)}>Hide</button>
    {/if}
  </div>

  {#if failure}
    <div class="hint bad">
      <strong>{failure.message}</strong>
      {#if failure.detail}<pre>{failure.detail}</pre>{/if}
    </div>
  {/if}

  {#if report !== null}
    <pre class="report" bind:this={reportElement}>{report}</pre>
  {/if}
</section>

<style>
  .report {
    max-height: 340px;
    overflow: auto;
    padding: 10px 12px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    user-select: text;
    white-space: pre;
  }
</style>
