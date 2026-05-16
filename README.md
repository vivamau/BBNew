# BBNew — Privacy-preserving cross-member beneficiary wallet deduplication

A small-scale simulation addressing a real WFP Building Blocks gap: today each
**network-member** (an independent organisation running its own node + backend +
database) only knows the `{common-identifier → proxy wallet}` mappings for the
beneficiaries *it* onboarded. When member A onboards a person and mints a wallet,
and member B later assists the **same person**, B cannot discover the wallet
already exists — so the person ends up with two wallets, which breaks redemption
and deduplication.

This prototype lets a member privately answer *"does a wallet already exist for
this common identifier, and what is it?"* **without any PII or cleartext wallet
ever crossing the member-to-member wire, and without a central server.**

> The blockchain here is **simulated** (`@bbnew/ledger`, in-process). That is a
> deliberate scope decision, not a TODO.

## How it works

The common identifier (National ID, Tax ID, UNHCR ID, …) is PII **even when
hashed** and must never be shared or put on chain. The protocol:

1. **VOPRF (RFC 9497, verifiable).** Each member holds its own OPRF key. A
   querier blinds the normalized identifier, the responder blind-evaluates it,
   and the querier unblinds to a per-responder pseudonym. The identifier never
   leaves the querier; the key never leaves the responder. A **DLEQ proof** is
   verified on every response, so a responder cannot use a per-query key to
   fingerprint queries.
2. **Match-oblivious, fixed-length lookup.** The querier derives an opaque
   16-byte tag (HKDF) and asks the responder for it. The responder always
   returns a **fixed-length** blob: a real AES-256-GCM ciphertext (owner +
   wallet sealed together) on a match, or an indistinguishable random blob on a
   miss. Only a querier that independently re-derived the OPRF output can
   decrypt. No set size, no intersection size, no match bit leaks on the wire.
3. **No-duplicate-wallet flow.** On a new beneficiary a member checks locally,
   then fans out to peers in deterministic order; it adopts the authoritative
   wallet (smallest owner member id) or mints a new one.
4. **Versioned key rotation.** A member can rotate its key; old pseudonyms
   become unresolvable once the old version is retired, bounding linkage —
   while dedup is preserved under the active key.
5. **Concurrent-onboarding reconciliation.** If two members mint for the same
   brand-new person simultaneously, `mergeWallets` + the deterministic-owner
   total order converges all members to one wallet with no coordinator.

## Packages

| Package | Responsibility |
|---|---|
| `@bbnew/shared` | identifier normalization, HKDF, fixed-length AEAD, tags, wire schemas, wire-audit |
| `@bbnew/voprf` | RFC 9497 VOPRF wrapper (`@cloudflare/voprf-ts`, P256-SHA256) + versioned key manager |
| `@bbnew/ledger` | simulated blockchain (random non-PII addresses, `mergeWallets`) |
| `@bbnew/member` | per-member Fastify service: `/meta`, `/oprf/evaluate`, `/lookup`, `/onboard`, `/admin/*` |
| `@bbnew/demo` | spins 3 members in-process and narrates the end-to-end scenario |

## Documentation

An interactive HTML reference covering the problem, cryptographic approach,
protocol steps, flow diagram, package descriptions, API endpoints, and honest
limitations is available at [`docs/index.html`](docs/index.html). Open it
directly in any browser — no server required.

## Run

```bash
npm install
npm run dev        # narrated 3-member end-to-end demo (asserts everything)
npm test           # unit + integration + wire-audit suite (vitest)
npm run typecheck  # tsc, no emit
```

`npm run dev` proves: same person → one wallet across M1/M2/M3; different person
→ different wallet; key rotation invalidates old pseudonyms yet still
deduplicates; a genuine concurrent race converges to one wallet; and an audit of
every member-to-member payload shows no PII or cleartext wallet.

### Interactive simulation portal

The portal spins up three in-process members and exposes a React UI for
hands-on exploration of the dedup flow:

```bash
npm run portal
```

This starts two processes concurrently:

| Process | Address |
|---|---|
| Vite dev server (React UI) | http://localhost:5173 |
| BFF / member API server | http://127.0.0.1:3001 |

Open **http://localhost:5173** in your browser. The UI lets you onboard
beneficiaries across members, trigger lookups, observe key rotation, and watch
the wire-audit log — all without writing any code.

## Honest limitations

- **This still processes personal data (GDPR).** OPRF outputs and tags are
  *pseudonymous*, not anonymous. Each member remains controller for its own
  local cleartext identifier store (lawful, necessary, never shared). The
  cryptography provides cross-member **data minimisation**, not anonymisation of
  a member's own records.
- **Offline dictionary attack.** Because identifiers are enumerable and a
  responder holds its own key, a responder can test offline whether a given
  person was ever the subject of a query against it (PII content never leaks).
  Mitigated by per-member keys, key rotation and rate-limiting — not eliminated.
  This is inherent to OPRFs over low-entropy inputs.
- **Not constant-time.** `@cloudflare/voprf-ts` is not constant-time in JS;
  timing side channels exist. Acceptable for a simulation.
- **"Offline" scope.** No central server ✅, beneficiary never online ✅, but
  member-to-member connectivity *is* required at onboarding (dedup is
  fundamentally a communication problem). A partitioned member can only
  provisionally mint and reconcile later via `mergeWallets` — not true offline
  dedup.
