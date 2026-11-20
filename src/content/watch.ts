// Re-runs `attempt` as the page changes, until it succeeds or time runs out.
//
// Throttled, not debounced: on a page that changes constantly (carousels, tickers, ads) a
// debounce that restarts on every mutation would never fire. Mutations that arrive while an
// attempt is running queue exactly one follow-up attempt instead of being dropped.

export interface WatchOptions {
  root: Node;
  /** Returns true when it has handled the page and watching should stop. */
  attempt: () => Promise<boolean>;
  /** Minimum gap between a mutation and the attempt it triggers. */
  delayMs: number;
  /** Stop watching after this long, whatever happens. */
  timeoutMs: number;
}

export function watch({ root, attempt, delayMs, timeoutMs }: WatchOptions): () => void {
  let finished = false;
  let running = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    finished = true;
    observer.disconnect();
    clearTimeout(timer);
    clearTimeout(deadline);
  };

  const run = async (): Promise<void> => {
    timer = undefined;
    if (finished) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      if (await attempt()) stop();
    } finally {
      running = false;
    }
    // schedule() is a no-op if the watch was stopped meanwhile.
    if (queued) {
      queued = false;
      schedule();
    }
  };

  function schedule(): void {
    if (finished || timer !== undefined) return;
    timer = setTimeout(() => void run(), delayMs);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  const deadline = setTimeout(stop, timeoutMs);
  void run();
  return stop;
}
