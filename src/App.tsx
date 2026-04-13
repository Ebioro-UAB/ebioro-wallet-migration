import { useState } from 'react';
import type { Keypair } from '@stellar/stellar-sdk';
import { StrKey } from '@stellar/stellar-sdk';
import {
    buildAndSubmitMigration,
    buildPreflight,
    keypairFromSecret,
    loadDestinationAccount,
    loadSourceAccount,
    stellarExpertAccountUrl,
    stellarExpertTxUrl,
    type Network,
    type PreflightReport,
} from './migration';

type Step = 'inputs' | 'preflight' | 'confirm' | 'submitting' | 'done' | 'error';

export default function App() {
    const [step, setStep] = useState<Step>('inputs');
    const [error, setError] = useState<string>('');

    const [network, setNetwork] = useState<Network>('testnet');
    const [accountAddress, setAccountAddress] = useState<string>('');
    const [credential, setCredential] = useState<string>('');
    const [destination, setDestination] = useState<string>('');

    const [recoveryKeypair, setRecoveryKeypair] = useState<Keypair | null>(null);
    const [preflight, setPreflight] = useState<PreflightReport | null>(null);

    const [txHash, setTxHash] = useState<string>('');

    const reset = () => {
        setStep('inputs');
        setError('');
        setAccountAddress('');
        setCredential('');
        setDestination('');
        setRecoveryKeypair(null);
        setPreflight(null);
        setTxHash('');
    };

    const runCheck = async () => {
        setError('');
        if (!accountAddress.trim()) {
            setError('Enter your Ebioro Account key.');
            return;
        }
        if (!StrKey.isValidEd25519PublicKey(accountAddress.trim())) {
            setError('Account key is not a valid Stellar public key.');
            return;
        }
        if (!credential.trim()) {
            setError('Enter your Stellar recovery secret key.');
            return;
        }
        if (!destination.trim()) {
            setError('Enter a destination Stellar account.');
            return;
        }
        if (!StrKey.isValidEd25519PublicKey(destination.trim())) {
            setError('Destination is not a valid Stellar public key.');
            return;
        }
        if (accountAddress.trim() === destination.trim()) {
            setError('Destination must be different from the Account key.');
            return;
        }

        setStep('preflight');
        try {
            const kp = keypairFromSecret(credential);
            const source = await loadSourceAccount(accountAddress.trim(), kp.publicKey(), network);
            const dest = await loadDestinationAccount(destination.trim(), network);
            const report = buildPreflight(source, dest);
            setRecoveryKeypair(kp);
            setPreflight(report);
        } catch (e: any) {
            setError(e?.message ?? 'Something went wrong.');
            setStep('error');
        }
    };

    const submit = async () => {
        if (!preflight || !recoveryKeypair) return;
        setStep('submitting');
        setError('');
        try {
            const { hash } = await buildAndSubmitMigration(
                preflight,
                recoveryKeypair,
                destination.trim(),
                network,
            );
            setTxHash(hash);
            setStep('done');
        } catch (e: any) {
            const horizonErr = e?.response?.data?.extras?.result_codes;
            const detail = horizonErr
                ? `Horizon rejected the transaction: ${JSON.stringify(horizonErr)}`
                : (e?.message ?? 'Transaction failed.');
            setError(detail);
            setStep('error');
        }
    };

    return (
        <>
            <h1>Ebioro Wallet Migration</h1>
            <p className="tagline">
                Move your funds to any Stellar wallet — independently, without Ebioro.
            </p>

            <div className="disclaimer">
                This is a one-way operation. Once you migrate, your Ebioro wallet will
                be emptied and you will use your destination wallet directly from now on.
                Use at your own risk.
            </div>

            {step === 'inputs' && (
                <InputsStep
                    network={network}
                    setNetwork={setNetwork}
                    accountAddress={accountAddress}
                    setAccountAddress={setAccountAddress}
                    credential={credential}
                    setCredential={setCredential}
                    destination={destination}
                    setDestination={setDestination}
                    error={error}
                    onCheck={runCheck}
                />
            )}

            {step === 'preflight' && !preflight && !error && (
                <LoadingCard message="Checking your accounts..." />
            )}

            {preflight && (step === 'preflight' || step === 'confirm') && (
                <PreflightStep
                    preflight={preflight}
                    network={network}
                    onBack={() => setStep('inputs')}
                    onContinue={() => submit()}
                />
            )}

            {step === 'submitting' && (
                <LoadingCard message="Submitting migration transaction..." />
            )}

            {step === 'done' && (
                <DoneStep
                    network={network}
                    destination={destination}
                    txHash={txHash}
                    residualXlm={preflight?.finalReservedXlm ?? ''}
                    sourceAddress={preflight?.source.address ?? ''}
                    onReset={reset}
                />
            )}

            {step === 'error' && (
                <ErrorStep
                    message={error || 'Unknown error.'}
                    onBack={() => setStep('inputs')}
                />
            )}
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────

function InputsStep(props: {
    network: Network;
    setNetwork: (n: Network) => void;
    accountAddress: string;
    setAccountAddress: (v: string) => void;
    credential: string;
    setCredential: (v: string) => void;
    destination: string;
    setDestination: (v: string) => void;
    error: string;
    onCheck: () => void;
}) {
    return (
        <div className="card">
            <label>Network</label>
            <div className="radio-group">
                <label>
                    <input
                        type="radio"
                        name="network"
                        checked={props.network === 'testnet'}
                        onChange={() => props.setNetwork('testnet')}
                    />
                    Testnet
                </label>
                <label>
                    <input
                        type="radio"
                        name="network"
                        checked={props.network === 'mainnet'}
                        onChange={() => props.setNetwork('mainnet')}
                    />
                    Mainnet
                </label>
            </div>

            <label>Ebioro Account key</label>
            <input
                type="text"
                placeholder="GXXXXXX..."
                value={props.accountAddress}
                onChange={(e) => props.setAccountAddress(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
            />
            <p className="hint">
                The public key (G...) of your Ebioro wallet. This is the multi-sig
                account holding your funds — not the recovery key.
            </p>

            <label>Stellar recovery secret key</label>
            <input
                type="text"
                placeholder="SXXXXXX..."
                value={props.credential}
                onChange={(e) => props.setCredential(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
            />
            <p className="hint">
                The Stellar secret key (S...) authorized to sign for your Account.
                Never leaves your browser — used locally to sign the migration
                transaction.
            </p>

            <label>Destination Stellar account</label>
            <input
                type="text"
                placeholder="GXXXXXX..."
                value={props.destination}
                onChange={(e) => props.setDestination(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
            />
            <p className="hint">
                The account where all funds will be sent. It must already exist on
                the selected network and must have trustlines for every non-XLM
                asset you want to move.
            </p>

            {props.error && <div className="error">{props.error}</div>}

            <div className="actions">
                <button onClick={props.onCheck}>Check accounts</button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────

function PreflightStep(props: {
    preflight: PreflightReport;
    network: Network;
    onBack: () => void;
    onContinue: () => void;
}) {
    const { preflight, network } = props;
    const xlmBalance = preflight.source.balances.find((b) => b.assetType === 'native')?.balance ?? '0';

    return (
        <div className="card">
            <h2>Source account</h2>
            <p className="hint" style={{ wordBreak: 'break-all' }}>
                <a
                    href={stellarExpertAccountUrl(preflight.source.address, network)}
                    target="_blank"
                    rel="noreferrer"
                >
                    {preflight.source.address}
                </a>
                <br />
                Your recovery key has weight {preflight.source.recoveryKeyWeight} on this account.
            </p>

            <h2>Balances</h2>
            <ul className="balance-list">
                <li className="balance-item">
                    <span>
                        <strong>{xlmBalance}</strong> XLM
                    </span>
                    <span className="balance-status ok">transferable: {preflight.transferableXlm}</span>
                </li>
                {preflight.plan
                    .filter((t) => t.assetCode !== 'XLM')
                    .map((t) => (
                        <li key={`${t.assetCode}:${t.assetIssuer}`} className="balance-item">
                            <span>
                                <strong>{t.amount}</strong> {t.assetCode}
                            </span>
                            <span className="balance-status ok">will transfer</span>
                        </li>
                    ))}
                {preflight.leftBehind.map((t) => (
                    <li key={`${t.assetCode}:${t.assetIssuer}`} className="balance-item">
                        <span>
                            <strong>{t.amount}</strong> {t.assetCode}
                        </span>
                        <span className="balance-status missing">no trustline on destination</span>
                    </li>
                ))}
            </ul>

            {preflight.trustlinesToRemove.length > 0 && (
                <>
                    <h2>Trustlines to remove</h2>
                    <ul className="balance-list">
                        {preflight.trustlinesToRemove.map((tl) => (
                            <li key={`${tl.assetCode}:${tl.assetIssuer}`} className="balance-item">
                                <span>{tl.assetCode}</span>
                                <span className="balance-status ok">frees 0.5 XLM</span>
                            </li>
                        ))}
                    </ul>
                    <p className="hint">
                        Empty trustlines will be removed in the same transaction, freeing
                        their reserved XLM so more can be transferred out.
                    </p>
                </>
            )}

            <p className="hint">
                After migration, your source account will keep{' '}
                <strong>{preflight.finalReservedXlm} XLM</strong> as Stellar's minimum
                reserve. This amount cannot be recovered — closing the account requires
                Ebioro cooperation. Fees are about{' '}
                <strong>{preflight.feeEstimateXlm} XLM</strong>.
            </p>

            {preflight.leftBehind.length > 0 && (
                <div className="disclaimer">
                    The destination account does not have trustlines for some of your assets.
                    These will stay in the Ebioro account. If you want to migrate them, go to
                    your destination wallet and add the missing trustlines, then rerun the check.
                </div>
            )}

            {!preflight.hasEnoughXlm && (
                <div className="error">
                    The source account doesn't have enough XLM to cover fees after the minimum
                    reserve. Top up the source account before retrying.
                </div>
            )}

            <div className="actions">
                <button className="secondary" onClick={props.onBack}>
                    Back
                </button>
                <button
                    onClick={props.onContinue}
                    disabled={!preflight.hasEnoughXlm}
                >
                    Migrate
                </button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────

function LoadingCard({ message }: { message: string }) {
    return (
        <div className="card">
            <p>
                <span className="spinner" />
                {message}
            </p>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────

function DoneStep(props: {
    network: Network;
    destination: string;
    txHash: string;
    residualXlm: string;
    sourceAddress: string;
    onReset: () => void;
}) {
    return (
        <div className="card">
            <h2>✓ Migration complete</h2>
            <p>
                Your funds have been moved to{' '}
                <a
                    href={stellarExpertAccountUrl(props.destination, props.network)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ wordBreak: 'break-all' }}
                >
                    {props.destination}
                </a>
                .
            </p>
            <p>
                <a
                    href={stellarExpertTxUrl(props.txHash, props.network)}
                    target="_blank"
                    rel="noreferrer"
                >
                    View transaction on Stellar Expert →
                </a>
            </p>
            {props.residualXlm && (
                <p className="hint">
                    Approximately <strong>{props.residualXlm} XLM</strong> remains in
                    your source account as Stellar's minimum reserve. It cannot be
                    recovered without closing the account, which requires Ebioro
                    cooperation.
                </p>
            )}
            <div className="actions">
                <button className="secondary" onClick={props.onReset}>
                    Start over
                </button>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────

function ErrorStep({ message, onBack }: { message: string; onBack: () => void }) {
    return (
        <div className="card">
            <h2>Something went wrong</h2>
            <p className="error">{message}</p>
            <div className="actions">
                <button className="secondary" onClick={onBack}>
                    Back
                </button>
            </div>
        </div>
    );
}
