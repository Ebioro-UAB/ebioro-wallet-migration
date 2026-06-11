# Ebioro Wallet Migration

A self-custody migration tool for Ebioro Stellar wallet users.

Move your funds from an Ebioro multi-signature wallet to any standard Stellar
wallet — **without the Ebioro app or server**. Your credentials never leave
your browser.

## How the Ebioro wallet is structured

The Ebioro wallet is **not a plain Stellar account**. It is a Stellar account
with multiple signers and raised thresholds, so that Ebioro can never spend
or alter the account on its own.

```
                  ┌──────────────────────────────────────────┐
                  │       Account (G...)                     │
                  │       master key weight: 0               │
                  │                                          │
                  │   thresholds                             │
                  │     low / med / high  = 20               │
                  │                                          │
                  │   signers:                               │
                  │     ● device_key      weight 20          │
                  │     ● backup_key      weight 20 (opt-in) │
                  │     ● cloud_key       weight 10          │
                  │     ● ebioro_signer   weight 10          │
                  └──────────────────────────────────────────┘
```

| Key | Where it lives | Purpose |
|---|---|---|
| **device_key** | Encrypted on the user's device (PIN / biometrics) | Everyday signing inside the Ebioro app |
| **backup_key** (opt-in) | 12-word phrase generated in the app under **Profile → Backup phrase**. Shown once, you write it on paper. Ebioro never sees it. | Independent user-held key. Emergency exit. **What this tool uses.** |
| **cloud_key** | 12-word BIP-39 mnemonic stored in the user's own iCloud / Google Drive backup ("cloud recovery phrase") | Assisted device replacement, together with the ebioro_signer (10 + 10 = 20) |
| **ebioro_signer** | Hardware-secured key management system operated for Ebioro | Co-signs assisted recovery. Cannot do anything alone. |

### What each party can do

All thresholds are 20, so a weight-20 key acts alone and weight-10 keys must
pair up:

| | Can spend (med = 20) | Can change signers (high = 20) |
|---|---|---|
| **device_key alone** | ✓ | ✓ |
| **backup_key alone** | **✓ ← what this tool uses** | ✓ |
| **cloud_key alone** | ✗ | ✗ |
| **ebioro_signer alone** | ✗ | ✗ |
| cloud + ebioro | ✓ | ✓ |

The backup key alone meets the medium threshold, so it can authorize
`payment` operations without any other signature. That's what makes
independent migration possible.

Ebioro's signer (weight 10) is below every threshold: **Ebioro cannot spend,
rotate signers, or close the account on its own.** Every combination that
reaches the threshold of 20 requires at least one key that you hold (device,
backup, or cloud recovery phrase).

Note the inverse is not true: your weight-20 keys also meet the high
threshold, so *you* could rotate signers or merge the account. This tool
deliberately does neither — it only sends payments and leaves the account
structure untouched (see below).

> **Don't have a backup phrase?** The cloud recovery phrase (weight 10)
> cannot spend on its own — the tool's preflight check will reject it.
> - If you still have the app and your device: create the backup phrase first
>   under **Profile → Backup phrase**, then use this tool.
> - If you lost your device: install the Ebioro app on a new device and
>   choose account recovery at sign-in (your cloud recovery phrase +
>   Ebioro's co-signer restore your access), then create the backup phrase.

## What this tool does

Builds a single Stellar transaction that:

1. Transfers each trustline balance from your Ebioro account to a destination
   account, for every asset the destination already accepts.
2. Transfers your XLM balance minus the required minimum reserve and the
   transaction fee.

The transaction is signed entirely with your backup key, in the browser, and
submitted directly to Horizon. Ebioro's backend is never called.

### What stays behind

- The source account itself (it still exists on-chain, empty of funds).
- Any non-XLM asset the destination doesn't have a trustline for. Add the
  trustlines in your destination wallet first, then re-run the tool.
- The minimum XLM reserve Stellar requires for the source account to keep
  existing (`0.5 XLM × (2 + subentries + sponsoring − sponsored)`).

### What this tool deliberately does NOT do

- **No `accountMerge`**: although a weight-20 key would technically meet the
  high threshold, this tool never merges the account. Migrating your balances
  while leaving the account structure intact keeps every other access path
  (app, assisted recovery) working.
- **No signer changes**: same reason.
- **No DEX swaps**: you're responsible for setting up the destination wallet
  correctly (trustlines).

## What you need

Three things:

1. **Your Ebioro Account key** (the `G...` of your wallet). Visible in the
   Ebioro app; also anywhere you've received funds to.
2. **Your backup credentials** — either:
   - The **12-word backup phrase** you wrote on paper when you set up
     **Backup phrase** in the Ebioro app, **or**
   - The **Stellar secret key** (`S...`) it derives, via SEP-0005
     (`m/44'/148'/0'`).

   Both encode the same key. The migration tool accepts either.

   *(The 12-word phrase from your iCloud / Google Drive cloud backup is a
   different, lower-weight key and will not pass the preflight check.)*
3. **A destination Stellar account** (`G...`) that already exists on the
   network and has trustlines for every non-XLM asset you want to move. Add
   trustlines in Lobstr, Freighter, or wherever your destination wallet lives
   **before** running this tool.

## Flow

1. Pick network (Testnet or Mainnet).
2. Paste your Ebioro Account key.
3. Choose your credential format (12-word phrase or Stellar secret) and paste it.
4. Paste your destination account.
5. The tool fetches both accounts from Horizon and validates that:
   - Your Account key exists
   - The key you provided is actually a signer on it, with weight ≥ medium threshold
   - The destination account exists
6. Preflight report: shows which balances will transfer, which will be left
   behind (no trustline on destination), estimated fees, minimum reserve.
7. Confirm → transaction is built, signed locally with your key, and
   submitted to Horizon.
8. Success screen with tx hash + Stellar Expert link.

## Development

```bash
yarn install
yarn dev      # http://localhost:5173
yarn build
yarn preview
```

## Deployment

Deployed to GitHub Pages automatically on push to `main` via
`.github/workflows/deploy.yml`.

If you configure a custom domain (CNAME), set `PAGES_BASE=/` in the workflow
to serve it at the root.

## Security

- 100% client-side. No backend. Credentials never leave your browser — only
  the signed transaction XDR is sent to Horizon.
- Uses `@stellar/stellar-sdk` for transaction building and signing, `bip39` +
  `ed25519-hd-key` for SEP-0005 derivation.
- This repository is open source. Review the source — especially
  [`src/migration.ts`](src/migration.ts) — before using it with real funds.

## License

MIT — see [LICENSE](LICENSE).
