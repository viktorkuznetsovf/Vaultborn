import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Contract, formatEther, parseEther } from 'ethers';
import type { Interface, LogDescription } from 'ethers';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';

import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/StakingApp.css';

type Position = {
  tokenId: bigint;
  encryptedHandle: string;
  pending: boolean;
};

type DecryptState = {
  loading: boolean;
  value?: string;
  error?: string;
};

type RedeemState = 'idle' | 'pending' | 'processing';

type EventLog = {
  args?: Record<string, unknown>;
};

type InterfaceLogInput = Parameters<Interface['parseLog']>[0];
type ParsedLogDescription = LogDescription;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function StakingApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const publicClient = usePublicClient();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [amount, setAmount] = useState('');
  const [isStaking, setIsStaking] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [decryptStates, setDecryptStates] = useState<Record<string, DecryptState>>({});
  const [redeemStates, setRedeemStates] = useState<Record<string, RedeemState>>({});
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: tokenIdsData, refetch: refetchTokens } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'tokensOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
  });

  const tokenIds = useMemo(() => {
    if (!tokenIdsData) {
      return [] as bigint[];
    }
    return (tokenIdsData as readonly bigint[]).map(id => BigInt(id));
  }, [tokenIdsData]);

  useEffect(() => {
    if (!publicClient || !address) {
      setPositions([]);
      return;
    }

    if (tokenIds.length === 0) {
      setPositions([]);
      return;
    }

    let cancelled = false;
    setPositionsLoading(true);

    (async () => {
      const fetched: Position[] = [];

      for (const tokenId of tokenIds) {
        try {
          const [encryptedHandle, pending] = await Promise.all([
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'getEncryptedStake',
              args: [tokenId],
            }),
            publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'isTokenPending',
              args: [tokenId],
            }),
          ]);

          fetched.push({
            tokenId,
            encryptedHandle: encryptedHandle as string,
            pending: Boolean(pending),
          });
        } catch (error) {
          console.error(`Failed to load position ${tokenId.toString()}:`, error);
        }
      }

      if (!cancelled) {
        setPositions(fetched);
      }
    })()
      .catch(error => console.error('Unable to fetch positions', error))
      .finally(() => {
        if (!cancelled) {
          setPositionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, address, tokenIds]);

  useEffect(() => {
    if (!publicClient || !address) {
      return;
    }

    const unwatchWithdraw = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      eventName: 'WithdrawCompleted',
      args: { staker: address },
      onLogs: (logs: EventLog[]) => {
        setPendingWithdrawals((prev: Record<string, string>) => {
          const next: Record<string, string> = { ...prev };
          for (const log of logs) {
            const tokenId = log.args?.tokenId as bigint | undefined;
            if (tokenId !== undefined) {
              delete next[tokenId.toString()];
            }
          }
          return next;
        });
        refetchTokens();
      },
    });

    return () => {
      unwatchWithdraw?.();
    };
  }, [publicClient, address, refetchTokens]);

  const handleAmountChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setAmount(event.target.value);
  }, []);

  const resetDecryptState = useCallback((tokenId: bigint) => {
    setDecryptStates(prev => {
      const next = { ...prev };
      delete next[tokenId.toString()];
      return next;
    });
  }, []);

  const handleStake = useCallback(async () => {
    if (!amount.trim()) {
      setStatusMessage('Please enter a stake amount in ETH.');
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = parseEther(amount.trim());
    } catch (error) {
      setStatusMessage('Invalid amount. Please enter a valid ETH value.');
      return;
    }

    if (parsedAmount <= 0) {
      setStatusMessage('Stake amount must be greater than zero.');
      return;
    }

    try {
      setIsStaking(true);
      const signer = await signerPromise;
      if (!signer) {
        setStatusMessage('Wallet signer not available. Please reconnect.');
        return;
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.stake({ value: parsedAmount });
      setStatusMessage(`Staking transaction submitted: ${tx.hash}`);

      await tx.wait();
      setStatusMessage('Stake confirmed. Your certificate is now available.');
      setAmount('');
      await refetchTokens();
    } catch (error) {
      console.error('Failed to stake:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatusMessage(`Failed to stake: ${message}`);
    } finally {
      setIsStaking(false);
    }
  }, [amount, signerPromise, refetchTokens]);

  const handleDecrypt = useCallback(
    async (position: Position) => {
      if (!instance || !address) {
        setDecryptStates(prev => ({
          ...prev,
          [position.tokenId.toString()]: {
            loading: false,
            error: 'Encryption service not ready. Please wait and try again.',
          },
        }));
        return;
      }

      const tokenKey = position.tokenId.toString();
      setDecryptStates(prev => ({
        ...prev,
        [tokenKey]: { loading: true },
      }));

      try {
        const keypair = instance.generateKeypair();
        const startTimestamp = Math.floor(Date.now() / 1000).toString();
        const validityDays = '10';
        const contractAddresses = [CONTRACT_ADDRESS];

        const eip712 = instance.createEIP712(
          keypair.publicKey,
          contractAddresses,
          startTimestamp,
          validityDays,
        );

        const signer = await signerPromise;
        if (!signer) {
          throw new Error('Wallet signer not available');
        }

        const signature = await signer.signTypedData(
          eip712.domain,
          {
            UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
          },
          eip712.message,
        );

        const result = await instance.userDecrypt(
          [
            {
              handle: position.encryptedHandle,
              contractAddress: CONTRACT_ADDRESS,
            },
          ],
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          contractAddresses,
          address,
          startTimestamp,
          validityDays,
        );

        const decryptedRaw = result[position.encryptedHandle];
        if (!decryptedRaw) {
          throw new Error('Unable to decrypt stake value.');
        }

        const decryptedAmount = formatEther(BigInt(decryptedRaw));
        setDecryptStates(prev => ({
          ...prev,
          [tokenKey]: { loading: false, value: decryptedAmount },
        }));
      } catch (error) {
        console.error('Decryption failed:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setDecryptStates(prev => ({
          ...prev,
          [tokenKey]: { loading: false, error: message },
        }));
      }
    },
    [address, instance, signerPromise],
  );

  const handleRedeem = useCallback(
    async (position: Position) => {
      const tokenKey = position.tokenId.toString();

      try {
        setRedeemStates(prev => ({ ...prev, [tokenKey]: 'processing' }));
        const signer = await signerPromise;
        if (!signer) {
          setStatusMessage('Wallet signer not available. Please reconnect.');
          setRedeemStates(prev => ({ ...prev, [tokenKey]: 'idle' }));
          return;
        }

        const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        const tx = await contract.redeem(position.tokenId);
        setStatusMessage(`Redeem transaction submitted: ${tx.hash}`);

        const receipt = await tx.wait();
        const parsedLog = receipt.logs
          .map((log: InterfaceLogInput): ParsedLogDescription | null => {
            try {
              return contract.interface.parseLog(log);
            } catch (error) {
              return null;
            }
          })
          .find((parsed: ParsedLogDescription | null): parsed is ParsedLogDescription => parsed?.name === 'WithdrawRequested');

        const requestId = parsedLog?.args?.requestId?.toString();
        setPendingWithdrawals(prev => ({
          ...prev,
          [tokenKey]: requestId ?? 'pending',
        }));

        setStatusMessage('Withdrawal request submitted. Waiting for oracle to finalize.');
        resetDecryptState(position.tokenId);
        await refetchTokens();
      } catch (error) {
        console.error('Failed to redeem stake:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setStatusMessage(`Failed to redeem stake: ${message}`);
      } finally {
        setRedeemStates(prev => ({ ...prev, [tokenKey]: 'idle' }));
      }
    },
    [refetchTokens, resetDecryptState, signerPromise],
  );

  const isStakeDisabled = useMemo(() => {
    return !isConnected || isStaking || amount.trim() === '';
  }, [isConnected, isStaking, amount]);

  if (!isConnected) {
    return (
      <div className="staking-app">
        <section className="card notice-card">
          <h2 className="card-title">Connect your wallet</h2>
          <p className="card-description">Connect a wallet to start staking ETH confidentially.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="staking-app">
      <section className="card stake-card">
        <h2 className="card-title">Stake ETH</h2>
        <p className="card-description">
          Lock ETH into the Vaultborn contract and receive an NFT certificate encrypted with Zama FHE.
        </p>
        <div className="stake-form">
          <label htmlFor="stakeAmount" className="input-label">
            Amount (ETH)
          </label>
          <input
            id="stakeAmount"
            type="number"
            min="0"
            step="0.0001"
            value={amount}
            onChange={handleAmountChange}
            className="stake-input"
            placeholder="0.00"
          />
          <button
            type="button"
            className="primary-button"
            onClick={handleStake}
            disabled={isStakeDisabled}
          >
            {isStaking ? 'Staking…' : 'Stake ETH'}
          </button>
          <p className="helper-text">
            Your ETH stays locked until you burn the certificate NFT and the oracle finalizes withdrawal.
          </p>
        </div>
      </section>

      {statusMessage && (
        <section className="card info-card">
          <p className="status-text">{statusMessage}</p>
        </section>
      )}

      {zamaError && (
        <section className="card warning-card">
          <p className="status-text">Encryption service error: {zamaError}</p>
        </section>
      )}

      <section className="card positions-card">
        <div className="positions-header">
          <h3 className="card-title">Your staking certificates</h3>
          {positionsLoading && <span className="status-pill">Refreshing…</span>}
        </div>
        {positions.length === 0 ? (
          <p className="card-description">No active staking certificates yet.</p>
        ) : (
          <div className="positions-list">
            {positions.map(position => {
              const tokenKey = position.tokenId.toString();
              const decryptState = decryptStates[tokenKey];
              const redeemState = redeemStates[tokenKey] ?? 'idle';
              const pendingRequestId = pendingWithdrawals[tokenKey];

              const isPendingWithdrawal = Boolean(pendingRequestId) || position.pending;

              return (
                <div className="position-row" key={tokenKey}>
                  <div className="position-details">
                    <div className="position-id">Token #{tokenKey}</div>
                    <div className="position-meta">
                      <span className="meta-label">Encrypted handle:</span>
                      <code className="meta-value">
                        {position.encryptedHandle === ZERO_ADDRESS ? 'Not initialized' : position.encryptedHandle}
                      </code>
                    </div>
                    <div className="position-meta">
                      <span className="meta-label">Stake amount:</span>
                      {decryptState?.value ? (
                        <span className="meta-value">{decryptState.value} ETH</span>
                      ) : decryptState?.loading ? (
                        <span className="meta-value">Decrypting…</span>
                      ) : (
                        <span className="meta-value">Hidden</span>
                      )}
                    </div>
                    {decryptState?.error && (
                      <div className="error-text">{decryptState.error}</div>
                    )}
                    {isPendingWithdrawal && (
                      <div className="pending-text">
                        Withdrawal in progress. Request ID: {pendingRequestId ?? 'awaiting oracle'}
                      </div>
                    )}
                  </div>
                  <div className="position-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleDecrypt(position)}
                      disabled={decryptState?.loading || zamaLoading || isPendingWithdrawal}
                    >
                      {decryptState?.loading ? 'Decrypting…' : 'Decrypt amount'}
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleRedeem(position)}
                      disabled={redeemState !== 'idle' || isPendingWithdrawal}
                    >
                      {redeemState === 'processing' ? 'Submitting…' : isPendingWithdrawal ? 'Pending' : 'Redeem'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
