# Ebioro Wallet Migration

A self-custody migration tool for Ebioro Stellar wallet users.

Move your funds from an Ebioro multi-signature wallet to any standard Stellar
wallet — **without the Ebioro app or server**. Your credentials never leave
your browser.

## How the Ebioro wallet is structured

The Ebioro wallet is **not a plain Stellar account**. It is a Stellar account
with multiple signers and raised thresholds, so that no single party (not even
Ebioro) can spend unilaterally.

```
                  ┌──────────────────────────────────────────┐
                  │       Account (G...)                     │
                  │       master key weight: 0               │
                  │                                          │
                  │   thresholds                             │
                  │     low / med  = 20  (spend)             │
                  │     high       = 30  (rotate signers)    │
                  │                                          │
                  │   signers:                               │
                  │     ● device_key      weight 20          │
                  │     ● recovery_key    weight 20          │
                  │     ● ebioro_signer   weight 10          │
                  └──────────────────────────────────────────┘
```

| Key | Where it lives | Purpose |
|---|---|---|
| **device_key** | Encrypted on the user's device (PIN) | Everyday signing inside the Ebioro app |
| **recovery_key** | 12-word BIP-39 mnemonic in the user's iCloud / Google Drive backup. Viewable in the app under **Profile → View recovery credentials**. | Independent user-held key. Emergency exit. |
| **ebioro_signer** | Held by Ebioro | Assisted recovery — required to rotate signers, but cannot spend alone |

### What each party can do

| | Can spend (med = 20) | Can rotate signers (high = 30) |
|---|---|---|
| **device_key alone** | ✓ | ✗ |
| **recovery_key alone** | **✓ ← what this tool uses** | ✗ |
| **ebioro_signer alone** | ✗ | ✗ |
| device + ebioro | ✓ | ✓ |
| recovery + ebioro | ✓ | ✓ |

The recovery key alone meets the medium threshold, so it can authorize
`payment` operations without any other signature. That's what makes
independent migration possible.

No one can rotate signers or close the account without Ebioro's cooperation
(high threshold is 30). This tool does **not** merge or alter the account — it
only sends payments out of it.

## What this tool does

Builds a single Stellar transaction that:

1. Transfers each trustline balance from your Ebioro account to a destination
   account, for every asset the destination already accepts.
2. Transfers your XLM balance minus the required minimum reserve and the
   transaction fee.

The transaction is signed entirely with your recovery key, in the browser, and
submitted directly to Horizon. Ebioro's backend is never called.

### What stays behind

- The source account itself (it still exists on-chain, empty of funds).
- Any non-XLM asset the destination doesn't have a trustline for. Add the
  trustlines in your destination wallet first, then re-run the tool.
- The minimum XLM reserve Stellar requires for the source account to keep
  existing (`0.5 XLM × (2 + subentries + sponsoring − sponsored)`).

### What this tool deliberately does NOT do

- **No `accountMerge`**: the account's high threshold is 30, and the recovery
  key alone only has weight 20. Merging is intentionally blocked so that
  neither Ebioro nor you can destroy the account's structure unilaterally.
- **No signer changes**: same reason.
- **No DEX swaps**: you're responsible for setting up the destination wallet
  correctly (trustlines).

## What you need

Three things:

1. **Your Ebioro Account key** (the `G...` of your wallet). Visible in the
   Ebioro app; also anywhere you've received funds to.
2. **Your recovery credentials** — either:
   - The **12-word recovery phrase** you wrote on paper when you set up
     "Recovery phrase" in the Ebioro app, **or**
   - The **Stellar secret key** (`S...`) it derives, via SEP-0005
     (`m/44'/148'/0'`).

   Both encode the same key. The migration tool accepts either.
3. **A destination Stellar account** (`G...`) that already exists on the
   network and has trustlines for every non-XLM asset you want to move. Add
   trustlines in Lobstr, Freighter, or wherever your destination wallet lives
   **before** running this tool.

## Flow

1. Pick network (Testnet or Mainnet).
2. Paste your Ebioro Account key.
3. Choose your recovery format (12-word phrase or Stellar secret) and paste it.
4. Paste your destination account.
5. The tool fetches both accounts from Horizon and validates that:
   - Your Account key exists
   - Your recovery key is actually a signer on it, with weight ≥ medium threshold
   - The destination account exists
6. Preflight report: shows which balances will transfer, which will be left
   behind (no trustline on destination), estimated fees, minimum reserve.
7. Confirm → transaction is built, signed locally with the recovery key, and
   submitted to Horizon.
8. Success screen with tx hash + Stellar Expert link.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run preview
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
