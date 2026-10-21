import { asAppError, runOperation } from "./api";
import type { AppError } from "./bindings/AppError";
import type { Operation } from "./bindings/Operation";
import type { ProgressEvent } from "./bindings/ProgressEvent";

const MAX_LOG_LINES = 400;
/** Docker can print thousands of progress lines while downloading: show them in batches. */
const FLUSH_MS = 120;

export const operationTitles: Record<Operation, string> = {
  install: "Installing ArboDat+",
  start: "Starting ArboDat+",
  stop: "Stopping ArboDat+",
};

/** The operation the user started in this window, with its progress and outcome. */
class OperationState {
  running = $state<Operation | null>(null);
  step = $state<{ index: number; total: number; label: string } | null>(null);
  log = $state<string[]>([]);
  error = $state<AppError | null>(null);
  /** An operation that has just finished successfully (shown until the next one starts). */
  succeeded = $state<Operation | null>(null);
  /** Something the user should know that isn't a failure (e.g. why the window didn't close). */
  notice = $state<string | null>(null);

  #buffer: string[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  #flush = () => {
    this.#timer = null;
    if (this.#buffer.length === 0) return;
    this.log = [...this.log, ...this.#buffer].slice(-MAX_LOG_LINES);
    this.#buffer = [];
  };

  #onEvent = (event: ProgressEvent) => {
    if (event.kind === "step") {
      this.step = { index: event.index, total: event.total, label: event.label };
    } else {
      this.#buffer.push(event.text);
      this.#timer ??= setTimeout(this.#flush, FLUSH_MS);
    }
  };

  /** Runs `operation`; `afterwards` (refreshing the status) runs on success and on failure and must not throw. */
  async run(operation: Operation, afterwards: () => Promise<void>) {
    if (this.running) return;
    this.running = operation;
    this.step = null;
    this.log = [];
    this.error = null;
    this.succeeded = null;
    this.notice = null;
    let failure: AppError | null = null;
    try {
      await runOperation(operation, this.#onEvent);
    } catch (e) {
      failure = asAppError(e);
    }
    if (this.#timer) clearTimeout(this.#timer);
    this.#flush();
    // Refresh the status BEFORE revealing the outcome: otherwise the success message would be
    // shown next to a stale "Installing…" for as long as the refresh takes.
    await afterwards();
    this.running = null;
    if (failure) this.error = failure;
    else this.succeeded = operation;
  }

  dismissError() {
    this.error = null;
  }
}

export const operation = new OperationState();
