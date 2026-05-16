import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'warn',
  transport:
    process.env.LOG_PRETTY === '1'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export interface WireRecord {
  dir: 'out' | 'in';
  from: string;
  to: string;
  method: string;
  path: string;
  body: unknown;
  at: number;
}

/**
 * In-process tap on every cross-member HTTP payload. Because the demo runs all
 * members in one Node process, a singleton captures the entire wire. Used to
 * PROVE that no PII / normalized id / raw OPRF output ever crosses the network.
 */
export class WireAudit {
  private records: WireRecord[] = [];
  private enabled = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  clear(): void {
    this.records = [];
  }

  record(r: WireRecord): void {
    if (this.enabled) this.records.push(r);
  }

  all(): readonly WireRecord[] {
    return this.records;
  }

  select(pred: (r: WireRecord) => boolean): WireRecord[] {
    return this.records.filter(pred);
  }

  /** Throws if any forbidden substring appears in any selected body. */
  assertNoneLeaked(forbidden: string[], pred?: (r: WireRecord) => boolean): void {
    const set = pred ? this.records.filter(pred) : this.records;
    const hay = set.map((r) => JSON.stringify(r.body)).join('|');
    for (const f of forbidden) {
      if (f.length > 0 && hay.includes(f)) {
        throw new Error(
          `WireAudit: forbidden value leaked on the wire: ${JSON.stringify(f)}`,
        );
      }
    }
  }

  /** Throws if any selected body has a key outside the per-path allow-list. */
  assertOnlyAllowedKeys(
    allow: Record<string, string[]>,
    pred?: (r: WireRecord) => boolean,
  ): void {
    const set = pred ? this.records.filter(pred) : this.records;
    for (const r of set) {
      const allowed = allow[r.path];
      if (!allowed || r.body == null || typeof r.body !== 'object') continue;
      for (const k of Object.keys(r.body as Record<string, unknown>)) {
        if (!allowed.includes(k)) {
          throw new Error(
            `WireAudit: unexpected key "${k}" on ${r.path} (allowed: ${allowed.join(', ')})`,
          );
        }
      }
    }
  }
}

export const wireAudit = new WireAudit();
