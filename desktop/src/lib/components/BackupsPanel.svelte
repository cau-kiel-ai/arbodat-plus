<script lang="ts">
  import { asAppError, deleteBackup, listBackups, openBackupFolder } from "../api";
  import type { BackupInfo } from "../bindings/BackupInfo";
  import type { BackupKind } from "../bindings/BackupKind";
  import type { BackupList } from "../bindings/BackupList";
  import type { Retained } from "../bindings/Retained";
  import type { StackStatus } from "../bindings/StackStatus";
  import { operation } from "../operation.svelte";

  const SHOWN = 5;
  const DEFAULT_DESCRIPTION = "manual backup";
  /** As in the backend (runtime/backup.rs, DESCRIPTION_MAX). */
  const DESCRIPTION_MAX = 25;

  let {
    stack,
    dockerReady,
    afterOperation,
  }: {
    stack: StackStatus;
    /** Docker, Compose and the engine are all usable right now. */
    dockerReady: boolean;
    /** Refreshes the status once an operation has ended. */
    afterOperation: () => Promise<void>;
  } = $props();

  const kindLabels: Record<BackupKind, string> = {
    manual: DEFAULT_DESCRIPTION,
    auto: "daily",
    beforeUpdate: "before update",
    beforeRestore: "before restore",
  };
  /** Why the retention policy keeps an automatic backup. */
  const retainedLabels: Record<Retained, string> = { daily: "daily", weekly: "weekly", monthly: "monthly" };

  function label(b: BackupInfo): string {
    if (b.kind === "manual") return b.description ?? DEFAULT_DESCRIPTION;
    if (b.kind === "auto") return b.retained ? retainedLabels[b.retained] : kindLabels.auto;
    return b.kind ? kindLabels[b.kind] : "from elsewhere";
  }

  let list = $state<BackupList | null>(null);
  let showAll = $state(false);

  async function load() {
    try {
      list = await listBackups();
    } catch (e) {
      operation.error = asAppError(e);
    }
  }

  // Again whenever an operation ends (a backup, but also the daily one, which shows as "busy").
  $effect(() => {
    void stack.phase;
    void operation.running;
    load();
  });

  const busy = $derived(stack.phase === "busy" || operation.running !== null);
  /** A backup needs the installation and its database; a stopped ArboDat+ is fine (only the database is started). */
  const canBackUp = $derived(["running", "stopped", "degraded"].includes(stack.phase));

  // "Back up" first asks for a short note, then makes the backup.
  let describing = $state(false);
  let description = $state(DEFAULT_DESCRIPTION);
  let descriptionField = $state<HTMLInputElement>();

  function askForDescription() {
    description = DEFAULT_DESCRIPTION;
    describing = true;
    // Selected, so typing replaces the default right away.
    queueMicrotask(() => descriptionField?.select());
  }

  async function backUp() {
    describing = false;
    await operation.run(
      "backup",
      async () => {
        await afterOperation();
        await load();
      },
      { description: description.trim() || DEFAULT_DESCRIPTION },
    );
  }

  /** The backup whose deletion waits for "Delete" or "Cancel". */
  let confirmingDelete = $state<string | null>(null);

  async function remove(fileName: string) {
    confirmingDelete = null;
    try {
      await deleteBackup(fileName);
    } catch (e) {
      operation.error = asAppError(e);
    }
    await load();
  }

  async function openFolder() {
    try {
      await openBackupFolder();
    } catch (e) {
      operation.error = asAppError(e);
    }
  }

  function when(b: BackupInfo): string {
    const date = new Date(b.created);
    return Number.isNaN(date.getTime())
      ? b.created
      : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function size(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  const shown = $derived(list ? (showAll ? list.backups : list.backups.slice(0, SHOWN)) : []);
</script>

<section>
  <h2>Backups</h2>

  {#if list}
    {#if list.backups.length}
      <p>Last backup: {when(list.backups[0])}</p>
    {:else}
      <p class="muted">No backups yet.</p>
    {/if}
    {#if list.lastAutoFailure}
      <div class="hint bad">The daily backup didn't work: {list.lastAutoFailure}</div>
    {/if}
  {/if}

  {#if describing}
    <form class="actions" onsubmit={(e) => { e.preventDefault(); backUp(); }}>
      <label class="visually-hidden" for="backup-description">Description</label>
      <input
        id="backup-description"
        type="text"
        maxlength={DESCRIPTION_MAX}
        size={DESCRIPTION_MAX}
        bind:value={description}
        bind:this={descriptionField}
        onkeydown={(e) => { if (e.key === "Escape") describing = false; }}
      />
      <button class="primary" type="submit" disabled={busy || !dockerReady || !canBackUp}>Back up</button>
      <button type="button" onclick={() => (describing = false)}>Cancel</button>
    </form>
  {:else}
    <div class="actions">
      <button class="primary" disabled={busy || !dockerReady || !canBackUp} onclick={askForDescription}>Back up</button>
      <button onclick={openFolder}>Open folder</button>
    </div>
  {/if}

  {#if shown.length}
    <table>
      <tbody>
        {#each shown as b (b.fileName)}
          <tr title={b.fileName}>
            <td>{when(b)}</td>
            <td>{label(b)}</td>
            <td class="mono">{b.stackVersion ?? ""}</td>
            <td class="num">{size(b.sizeBytes)}</td>
            <td class="num muted">{b.rows !== null ? `${b.rows.toLocaleString()} rows` : ""}</td>
            <td class="icon">
              <button
                class="trash danger-hover"
                title="Delete this backup"
                aria-label="Delete this backup"
                disabled={busy}
                onclick={() => (confirmingDelete = confirmingDelete === b.fileName ? null : b.fileName)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 4h11M6 4V2.5h4V4M3.8 4l.7 9.5h7l.7-9.5M6.6 6.5v4.8M9.4 6.5v4.8" />
                </svg>
              </button>
            </td>
          </tr>
          {#if confirmingDelete === b.fileName}
            <tr class="confirm">
              <td colspan="6">
                <div class="hint bad">
                  <strong>Delete this backup?</strong><br />
                  {when(b)} · {label(b)}
                </div>
                <div class="actions">
                  <button class="danger" disabled={busy} onclick={() => remove(b.fileName)}>Delete</button>
                  <button onclick={() => (confirmingDelete = null)}>Cancel</button>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
    {#if list && list.backups.length > SHOWN}
      <button class="link" onclick={() => (showAll = !showAll)}>
        {showAll ? "Show fewer" : `Show all ${list.backups.length}`}
      </button>
    {/if}
  {/if}

  <p class="muted small">
    When the app is open and ArboDat+ is running, a backup is made automatically once a day.<br />
    Of these automatic backups, the most recent from the last 7 days, 4 weeks and 12 months are kept.<br />
    Backups created manually, as well as those made before an update or a restore, are never deleted.
  </p>
</section>

<style>
  p { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 14px; }
  td { padding: 5px 8px 5px 0; border-top: 1px solid var(--border); white-space: nowrap; }
  td.num { text-align: right; }
  td.icon { width: 1%; padding-right: 0; text-align: right; }
  .trash { padding: 3px 6px; line-height: 0; border-color: transparent; background: transparent; color: var(--muted); }
  tr.confirm td { border-top: none; padding-top: 0; white-space: normal; }
  tr.confirm .hint { margin-top: 4px; }
  tr.confirm .actions { margin-top: 10px; margin-bottom: 6px; }
  button.danger { background: var(--bad); border-color: var(--bad); color: #fff; font-weight: 600; }
  .small { font-size: 13px; margin-top: 12px; }
  input[type="text"] { font: inherit; padding: 5px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
