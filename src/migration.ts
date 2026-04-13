import {
    Asset,
    Horizon,
    Keypair,
    Networks,
    Operation,
    TransactionBuilder,
} from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

export type Network = 'testnet' | 'mainnet';

export function horizonUrl(network: Network): string {
    return network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org';
}

export function networkPassphrase(network: Network): string {
    return network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
}

export function horizon(network: Network): Horizon.Server {
    return new Horizon.Server(horizonUrl(network));
}

/**
 * Derive a Stellar keypair from a BIP-39 mnemonic following SEP-0005.
 * Path m/44'/148'/0' is the first (and for Ebioro, only) Stellar account.
 */
export function keypairFromMnemonic(mnemonic: string, accountIndex = 0): Keypair {
    const trimmed = mnemonic.trim().split(/\s+/).join(' ');
    if (!bip39.validateMnemonic(trimmed)) {
        throw new Error('Invalid recovery phrase.');
    }
    const seed = bip39.mnemonicToSeedSync(trimmed).toString('hex');
    const { key } = derivePath(`m/44'/148'/${accountIndex}'`, seed);
    return Keypair.fromRawEd25519Seed(key);
}

export function keypairFromSecret(secret: string): Keypair {
    const trimmed = secret.trim();
    try {
        return Keypair.fromSecret(trimmed);
    } catch {
        throw new Error('Invalid Stellar secret key.');
    }
}

export interface SourceAccount {
    address: string;
    recoveryKeyWeight: number;
    medThreshold: number;
    balances: BalanceInfo[];
    subentryCount: number;
    numSponsoring: number;
    numSponsored: number;
}

export interface BalanceInfo {
    assetType: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
    assetCode: string;          // 'XLM' for native
    assetIssuer?: string;       // undefined for native
    balance: string;            // stringified decimal (stroops already scaled)
}

/**
 * Load the user's source (Ebioro) account and verify that the provided
 * recovery key is actually a signer on it with enough weight to spend alone.
 */
export async function loadSourceAccount(
    sourceAddress: string,
    recoveryPublicKey: string,
    network: Network,
): Promise<SourceAccount> {
    const server = horizon(network);

    let account;
    try {
        account = await server.loadAccount(sourceAddress);
    } catch (err: any) {
        if (err?.response?.status === 404) {
            throw new Error(
                'Source account does not exist on the selected network.',
            );
        }
        throw err;
    }

    const recoverySigner = account.signers.find(
        (s) => s.key === recoveryPublicKey,
    );
    if (!recoverySigner || recoverySigner.weight <= 0) {
        throw new Error(
            'The recovery key you provided is not a signer on this account. ' +
            'Check that the Account key and the Recovery key match.',
        );
    }

    const medThreshold = account.thresholds.med_threshold;
    if (recoverySigner.weight < medThreshold) {
        throw new Error(
            `The recovery key has weight ${recoverySigner.weight}, which is below ` +
            `the account's medium threshold (${medThreshold}). It can't authorize ` +
            'payments on its own.',
        );
    }

    const balances: BalanceInfo[] = account.balances.flatMap((b): BalanceInfo[] => {
        if (b.asset_type === 'native') {
            return [{
                assetType: 'native',
                assetCode: 'XLM',
                balance: b.balance,
            }];
        }
        if (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') {
            return [{
                assetType: b.asset_type,
                assetCode: b.asset_code,
                assetIssuer: b.asset_issuer,
                balance: b.balance,
            }];
        }
        // liquidity_pool_shares — not transferable via this tool; skip.
        return [];
    });

    return {
        address: account.account_id,
        recoveryKeyWeight: recoverySigner.weight,
        medThreshold,
        balances,
        subentryCount: account.subentry_count ?? 0,
        numSponsoring: (account as any).num_sponsoring ?? 0,
        numSponsored: (account as any).num_sponsored ?? 0,
    };
}

export interface DestinationAccount {
    address: string;
    trustlines: Set<string>; // `${code}:${issuer}` for credit assets
}

/**
 * Fetch destination account trustlines. Throws if the account doesn't exist.
 */
export async function loadDestinationAccount(
    destinationAddress: string,
    network: Network,
): Promise<DestinationAccount> {
    const server = horizon(network);
    try {
        const account = await server.loadAccount(destinationAddress);
        const trustlines = new Set<string>();
        for (const b of account.balances) {
            if (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') {
                trustlines.add(`${b.asset_code}:${b.asset_issuer}`);
            }
        }
        return { address: account.account_id, trustlines };
    } catch (err: any) {
        if (err?.response?.status === 404) {
            throw new Error(
                'Destination account does not exist on this network. Fund it first, then retry.',
            );
        }
        throw err;
    }
}

export interface PreflightReport {
    source: SourceAccount;
    destination: DestinationAccount;
    plan: PlannedTransfer[];
    leftBehind: PlannedTransfer[];
    reservedXlm: string;
    transferableXlm: string;
    hasEnoughXlm: boolean;
    feeEstimateXlm: string;
}

export interface PlannedTransfer {
    assetCode: string;
    assetIssuer?: string;
    amount: string;
}

const BASE_FEE_STROOPS = 100; // conservative per-op fee
const BASE_RESERVE_XLM = 0.5; // Stellar network constant

function computeRequiredReserve(source: SourceAccount): number {
    // (2 + subentries + num_sponsoring - num_sponsored) * baseReserve
    return BASE_RESERVE_XLM * (
        2
        + source.subentryCount
        + source.numSponsoring
        - source.numSponsored
    );
}

export function buildPreflight(
    source: SourceAccount,
    destination: DestinationAccount,
): PreflightReport {
    const plan: PlannedTransfer[] = [];
    const leftBehind: PlannedTransfer[] = [];

    for (const b of source.balances) {
        if (b.assetType === 'native') continue;
        const amount = parseFloat(b.balance);
        if (amount <= 0) continue;
        const key = `${b.assetCode}:${b.assetIssuer}`;
        const transfer: PlannedTransfer = {
            assetCode: b.assetCode,
            assetIssuer: b.assetIssuer,
            amount: b.balance,
        };
        if (destination.trustlines.has(key)) {
            plan.push(transfer);
        } else {
            leftBehind.push(transfer);
        }
    }

    const xlmBalance = parseFloat(
        source.balances.find((b) => b.assetType === 'native')?.balance ?? '0',
    );

    const reservedXlm = computeRequiredReserve(source);

    // Estimate fees: base fee per op × (non-native payments + 1 XLM payment).
    // Stroops → XLM: / 1e7.
    const opCount = plan.length + 1;
    const feeEstimateXlm = (BASE_FEE_STROOPS * opCount) / 1e7;

    // XLM we can actually send out.
    const transferable = xlmBalance - reservedXlm - feeEstimateXlm;
    const transferableXlm = transferable > 0 ? transferable.toFixed(7) : '0';

    return {
        source,
        destination,
        plan,
        leftBehind,
        reservedXlm: reservedXlm.toFixed(7),
        transferableXlm,
        hasEnoughXlm: transferable > 0,
        feeEstimateXlm: feeEstimateXlm.toFixed(7),
    };
}

export async function buildAndSubmitMigration(
    preflight: PreflightReport,
    recoveryKeypair: Keypair,
    destinationAddress: string,
    network: Network,
): Promise<{ hash: string }> {

    const server = horizon(network);
    const sourceAccount = await server.loadAccount(preflight.source.address);
    const opCount = preflight.plan.length + 1;
    const fee = String(BASE_FEE_STROOPS * opCount);

    const builder = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: networkPassphrase(network),
    });

    for (const transfer of preflight.plan) {
        const asset = transfer.assetIssuer
            ? new Asset(transfer.assetCode, transfer.assetIssuer)
            : Asset.native();
        builder.addOperation(
            Operation.payment({
                destination: destinationAddress,
                asset,
                amount: transfer.amount,
            }),
        );
    }

    // Finally, the XLM payment.
    builder.addOperation(
        Operation.payment({
            destination: destinationAddress,
            asset: Asset.native(),
            amount: preflight.transferableXlm,
        }),
    );

    const tx = builder.setTimeout(600).build();
    tx.sign(recoveryKeypair);

    const result = await server.submitTransaction(tx);
    return { hash: (result as any).hash as string };
}

export function stellarExpertAccountUrl(address: string, network: Network): string {
    const path = network === 'testnet' ? 'testnet' : 'public';
    return `https://stellar.expert/explorer/${path}/account/${address}`;
}

export function stellarExpertTxUrl(hash: string, network: Network): string {
    const path = network === 'testnet' ? 'testnet' : 'public';
    return `https://stellar.expert/explorer/${path}/tx/${hash}`;
}
