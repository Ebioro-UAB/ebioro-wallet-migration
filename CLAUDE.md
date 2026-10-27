# ebioro-wallet-migration

Public, MIT-licensed, browser-only tool that lets an Ebioro wallet user move their funds to any standard Stellar wallet **without the Ebioro app or any Ebioro server**. The user enters their backup phrase (or secret key); the page builds one transaction paying out every trustline balance plus XLM (minus reserve and fee) and removing emptied trustlines. Credentials never leave the browser.

## Architecture

- Vite + React 18 + TypeScript, `@stellar/stellar-sdk` ^13, `bip39` + `ed25519-hd-key` (SEP-0005 path `m/44'/148'/0'`). All logic is in `src/migration.ts`; `src/App.tsx` is the UI.
- Talks only to public Horizon (`horizon.stellar.org` / testnet). No backend, no analytics, no third-party script.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml`; `vite.config.ts` sets `base` to `/ebioro-wallet-migration/` unless `PAGES_BASE` is provided (custom domain → `/`).
- yarn (`yarn.lock`).

## Dev commands

```bash
yarn
yarn dev
yarn typecheck
yarn build      # tsc -b && vite build
```

## Gotchas

- **The README's account-architecture section is the contract** (signer weights, thresholds, which key can do what). It was corrected twice after the UI drifted from it — when you touch copy, re-read the README and keep them identical.
- **Only a weight-20 key may migrate.** The cloud recovery phrase derives a weight-10 key and must be rejected by the preflight check with the explanatory message, never silently fail at submit.
- **Do not assume a removed sponsored trustline refunds its reserve** to the account — reserve maths must treat sponsored entries separately.
- **The tool only sends payments and removes empty trustlines.** It never rotates signers, merges the account, or changes thresholds, even though the user's key could. Keep that invariant; it is what makes the tool safe to publish.
- Never add a call to an Ebioro endpoint, a logger that sees the secret or mnemonic, or any dependency that phones home. This repo is public and world-readable — no internal hostnames, vendor names, or unreleased features in code, comments, or this file.

<!-- BEGIN ebioro-non-negotiables v2 — master: Ebioro-UAB/documentation -->
## Ebioro non-negotiables

- **GitHub text hygiene — the KU corridor country is never named.** In any
  GitHub-visible text (commit messages, PR titles/bodies, reviews, issues,
  branch names, release notes, code/spec comments) write `KU` — never the
  country's name, demonym, or capital. The ISO code `CU` as functional data
  (string literals, catalog entries, `=== 'CU'` checks) and full-country
  datasets (countries.json, i18n locales) are fine. End-user UI strings may
  carry the real name; keep those literals minimal. Scrub old text on touch.
- **Never merge or push to `main`, never tag a production release, never deploy.**
  Open the PR and stop. Merges and deploys are human-only — no exception for
  "the review passed" or "it's just a patch bump". Never delete `main`,
  `master`, or `development`.
- **Never commit `.env` or any file containing a secret.** `.gitignore` covers
  `.env*` with `.env.example` as the only tracked variant. A secret that lands
  in git is leaked even after the file is removed — rotate it.
- **No AI attribution in git or GitHub text.** No `Co-Authored-By:` lines, no
  "Generated with …" footers in commits, PR bodies, or issues.
- **Error handling: `neverthrow` Result types. Never `try/catch`.**
- **TypeORM migrations: snake_case column identifiers only.** Quoting
  `"customerId"` preserves camelCase; TypeORM then queries `customer_id` and
  crashes at runtime. `build` does not catch it. This has cost two fix
  migrations already.
- **Follow the existing flow in code, not design docs or mockups.** Find the
  nearest equivalent already implemented and match it. Design notes are
  proposals.
- **Money paths**: integer stroops/cents, never floats. Idempotency keys on
  anything that moves money. Stellar sequence numbers fetched fresh. Never log
  or expose a signing key or an API secret.
- **Ebioro never holds keys for customer funds.** Before creating any key or
  account, ask whose funds it will hold. If a customer's, it cannot be a key
  Ebioro can use alone.
- **User-facing copy hides blockchain jargon.** "Payment reference", not
  "transaction hash". "Settled", not "confirmed on ledger N". "Network fee",
  not "XLM base fee". No signing-vendor names. It should read like a bank app,
  not a block explorer.
- **No regulatory claims** in user-facing text — not "licensed", "registered",
  "authorised", "MiCAR-compliant", or any variant. Route legal-sounding copy
  through Ebioro before merging.
- **Soft-delete only** (`deletedAt`). Never hard-delete.
- **Never skip pre-commit hooks** (`--no-verify`). Flag new dependencies in the
  PR description.
- **Never paste production data, customer PII, credentials, or KYC/AML content
  into an AI tool.** Anonymised or synthetic only.
<!-- END ebioro-non-negotiables v2 -->
