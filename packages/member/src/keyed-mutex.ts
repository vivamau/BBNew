/**
 * Per-key serialization. Onboarding the same person concurrently at one member
 * is serialized so the "do I already know them?" check and the insert can't
 * interleave. Distinct keys never block each other.
 */
export class KeyedMutex {
  private chains = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    this.chains.set(
      key,
      prev.then(() => gate),
    );
    try {
      await prev;
      return await fn();
    } finally {
      release();
      // best-effort cleanup so the map doesn't grow unbounded
      queueMicrotask(() => {
        if (this.chains.get(key) === prev) this.chains.delete(key);
      });
    }
  }
}
