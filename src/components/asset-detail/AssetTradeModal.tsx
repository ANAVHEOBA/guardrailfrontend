import { Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { Portal } from "solid-js/web";

import {
  assetClient,
  formatAssetTokenBaseUnits,
  formatPaymentTokenAmountFromBaseUnits,
  parseAssetTokenAmountInput,
  parseUsdcAmountInput,
  type AssetDetailResponse,
  type AssetHolderStateResponse,
  type AssetResponse,
  type GaslessAssetActionResponse,
  type PaymentTokenDisplayMeta,
} from "~/lib";
import { getErrorMessage } from "~/lib/api";
import { readStoredAuthSession } from "~/lib/auth/session";

import type { PriceMode } from "./types";

interface AssetTradeModalProps {
  asset: AssetResponse;
  detail: AssetDetailResponse | null;
  mode: PriceMode;
  onClose: () => void;
  onCompleted: (response: GaslessAssetActionResponse) => void;
  open: boolean;
  paymentTokenMeta: PaymentTokenDisplayMeta;
  requestedAmount: string;
}

type ExecutionStatus = "idle" | "working" | "success" | "error";

function CloseIcon() {
  return (
    <svg viewBox="0 0 13 13" aria-hidden="true">
      <path
        d="M1.5 1.5 11.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
      <path
        d="M11.5 1.5 1.5 11.5"
        fill="none"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="1.5"
      />
    </svg>
  );
}

function getTradeErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const errorCode = (error as { code?: unknown }).code;

    if (errorCode === 4001) {
      return "The request was rejected in your wallet.";
    }

    if (errorCode === -32002) {
      return "Open your wallet to continue the pending request.";
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return getErrorMessage(error);
}

function normalizeSellAssetAmount(value: string): string | null {
  try {
    return parseAssetTokenAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}

function normalizeBuyAssetAmount(value: string, asset: AssetResponse): string | null {
  try {
    const settlementAmount = BigInt(parseUsdcAmountInput(value).baseUnits);
    const subscriptionPrice = BigInt(asset.price_per_token);

    if (subscriptionPrice <= 0n) {
      return null;
    }

    const tokenAmount = (settlementAmount * 10n ** 18n) / subscriptionPrice;
    return tokenAmount > 0n ? tokenAmount.toString() : null;
  } catch {
    return null;
  }
}

function allowanceNeedsApproval(
  holder: AssetHolderStateResponse | null,
  requiredAmount: string,
): boolean {
  if (!holder) {
    return true;
  }

  try {
    return BigInt(holder.payment_token_allowance_to_treasury) < BigInt(requiredAmount);
  } catch {
    return true;
  }
}

function formatGroupedDisplayAmount(value: string): string {
  const [wholePart, fractionalPart = ""] = value.split(".");
  const whole = (wholePart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fractionalPart ? `${whole}.${fractionalPart}` : whole;
}

function formatTradeInput(mode: PriceMode, value: string): string | null {
  try {
    const displayAmount =
      mode === "buy"
        ? parseUsdcAmountInput(value).displayAmount
        : parseAssetTokenAmountInput(value).displayAmount;

    return formatGroupedDisplayAmount(displayAmount);
  } catch {
    return null;
  }
}

function formatCompactAssetAmount(raw: string, maxFractionDigits = 4): string {
  const formatted = formatAssetTokenBaseUnits(raw);

  if (!formatted.includes(".")) {
    return formatted;
  }

  const [whole, fractional = ""] = formatted.split(".");
  const truncated = fractional.slice(0, maxFractionDigits).replace(/0+$/, "");

  return truncated ? `${whole}.${truncated}` : whole;
}

function calculateRedemptionValue(assetAmount: string, asset: AssetResponse): string | null {
  try {
    const tokenAmount = BigInt(assetAmount);
    const redemptionPrice = BigInt(asset.redemption_price_per_token);
    return ((tokenAmount * redemptionPrice) / 10n ** 18n).toString();
  } catch {
    return null;
  }
}

export default function AssetTradeModal(props: AssetTradeModalProps) {
  const [status, setStatus] = createSignal<ExecutionStatus>("idle");
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<GaslessAssetActionResponse | null>(null);
  const [transactionHashes, setTransactionHashes] = createSignal<string[]>([]);
  const [activeRequestKey, setActiveRequestKey] = createSignal<string | null>(null);
  let executionVersion = 0;

  const quoteLabel = createMemo(() => (props.mode === "buy" ? "Subscription" : "Redemption"));
  const laneLabel = createMemo(() => (props.mode === "buy" ? "Primary issue" : "Treasury exit"));
  const priceLabel = createMemo(() =>
    formatPaymentTokenAmountFromBaseUnits(
      props.mode === "buy" ? props.asset.price_per_token : props.asset.redemption_price_per_token,
      props.paymentTokenMeta,
    ),
  );
  const amountLabel = createMemo(() => formatTradeInput(props.mode, props.requestedAmount));
  const normalizedAmount = createMemo(() =>
    props.mode === "buy"
      ? normalizeBuyAssetAmount(props.requestedAmount, props.asset)
      : normalizeSellAssetAmount(props.requestedAmount),
  );
  const estimateLabel = createMemo(() => {
    const amount = normalizedAmount();

    if (!amount) {
      return null;
    }

    if (props.mode === "buy") {
      return `${formatCompactAssetAmount(amount)} ${props.asset.symbol}`;
    }

    const proceeds = calculateRedemptionValue(amount, props.asset);
    return proceeds
      ? formatPaymentTokenAmountFromBaseUnits(proceeds, props.paymentTokenMeta)
      : null;
  });

  const modalTitle = createMemo(() =>
    props.mode === "buy" ? "Submitting subscription" : "Submitting redemption",
  );

  const statusTitle = createMemo(() => {
    if (status() === "success") {
      return "Trade submitted";
    }

    if (status() === "error") {
      return "Trade failed";
    }

    return "Processing trade";
  });

  const resetState = () => {
    setStatus("idle");
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
  };

  createEffect(() => {
    if (!props.open) {
      executionVersion += 1;
      setActiveRequestKey(null);
      resetState();
    }
  });

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && status() !== "working") {
        props.onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  createEffect(() => {
    const open = props.open;
    const requestKey = `${props.asset.asset_address}:${props.mode}:${props.requestedAmount.trim()}`;

    if (!open) {
      return;
    }

    if (requestKey === untrack(activeRequestKey)) {
      return;
    }

    setActiveRequestKey(requestKey);
    resetState();
    setStatus("working");

    const version = ++executionVersion;
    const asset = untrack(() => props.asset);
    const detail = untrack(() => props.detail);
    const paymentTokenMeta = untrack(() => props.paymentTokenMeta);
    const requestedAmount = untrack(() => props.requestedAmount);
    const mode = untrack(() => props.mode);

    const runTrade = async () => {
      const normalized =
        mode === "buy"
          ? normalizeBuyAssetAmount(requestedAmount, asset)
          : normalizeSellAssetAmount(requestedAmount);
      const settlementAmountBaseUnits =
        mode === "buy" ? parseUsdcAmountInput(requestedAmount).baseUnits : null;

      if (!normalized) {
        throw new Error(
          mode === "buy"
            ? `Enter a valid ${paymentTokenMeta.symbol} amount to continue.`
            : "Enter a valid token amount to continue.",
        );
      }

      if (mode === "buy") {
        setStatusMessage("Checking subscription...");
      } else {
        setStatusMessage("Submitting redemption...");
      }

      const session = readStoredAuthSession();

      if (!session?.token) {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("guardrail:open-auth-modal"));
        }

        throw new Error("Sign in with your linked wallet to continue.");
      }

      if (session.user.wallet?.account_kind !== "smart_account") {
        throw new Error("This flow requires your linked smart-account wallet.");
      }

      const hashes: string[] = [];
      let holder = detail?.holder ?? null;

      if (mode === "buy") {
        const walletAddress = session.user.wallet?.wallet_address?.trim();

        if (!holder && walletAddress) {
          setStatusMessage("Checking wallet allowance...");
          holder = await assetClient.fetchAssetHolderState(asset.asset_address, walletAddress);

          if (version !== executionVersion) {
            return;
          }
        }

        if (settlementAmountBaseUnits && allowanceNeedsApproval(holder, settlementAmountBaseUnits)) {
          setStatusMessage("Approving payment token...");

          const approvalResponse = await assetClient.approvePaymentToken(
            session.token,
            asset.asset_address,
            { amount: settlementAmountBaseUnits },
          );

          if (version !== executionVersion) {
            return;
          }

          holder = approvalResponse.holder;

          if (approvalResponse.tx_hash) {
            hashes.push(approvalResponse.tx_hash);
          }
        }

        setStatusMessage("Submitting subscription...");

        const response = await assetClient.purchaseAsset(session.token, asset.asset_address, {
          token_amount: normalized,
        });

        if (version !== executionVersion) {
          return;
        }

        if (response.tx_hash) {
          hashes.push(response.tx_hash);
        }

        setTransactionHashes(hashes);
        setResult(response);
        setStatus("success");
        setStatusMessage("Subscription submitted through your smart account.");
        props.onCompleted(response);
        return;
      }

      const response = await assetClient.redeemAsset(session.token, asset.asset_address, {
        amount: normalized,
      });

      if (version !== executionVersion) {
        return;
      }

      if (response.tx_hash) {
        hashes.push(response.tx_hash);
      }

      setTransactionHashes(hashes);
      setResult(response);
      setStatus("success");
      setStatusMessage("Redemption submitted through your smart account.");
      props.onCompleted(response);
    };

    void runTrade().catch(error => {
      if (version !== executionVersion) {
        return;
      }

      setStatus("error");
      setStatusMessage(null);
      setErrorMessage(getTradeErrorMessage(error));
    });
  });

  return (
    <Portal>
      <Show when={props.open}>
        <div
          class="pm-asset-trade-modal__overlay"
          onMouseDown={() => {
            if (status() !== "working") {
              props.onClose();
            }
          }}
        >
          <div
            class="pm-asset-trade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-trade-modal-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <div class="pm-asset-trade-modal__frame">
              <div class="pm-asset-trade-modal__header">
                <div>
                  <p class="pm-asset-trade-modal__eyebrow">Execution</p>
                  <h2 id="asset-trade-modal-title" class="pm-asset-trade-modal__title">
                    {modalTitle()}
                  </h2>
                  <p class="pm-asset-trade-modal__subtitle">
                    {props.asset.symbol} · {priceLabel()}
                  </p>
                </div>

                <button
                  type="button"
                  class="pm-asset-trade-modal__close"
                  onClick={props.onClose}
                  disabled={status() === "working"}
                  aria-label="Close trade status"
                >
                  <CloseIcon />
                </button>
              </div>

              <div class="pm-asset-trade-modal__body">
                <div class="pm-asset-trade-modal__summary-card">
                  <div class="pm-asset-trade-modal__summary-grid">
                    <div class="pm-asset-trade-modal__summary-row">
                      <span class="pm-asset-trade-modal__summary-label">Lane</span>
                      <strong class="pm-asset-trade-modal__summary-value">{laneLabel()}</strong>
                    </div>
                    <div class="pm-asset-trade-modal__summary-row">
                      <span class="pm-asset-trade-modal__summary-label">Price</span>
                      <strong class="pm-asset-trade-modal__summary-value">{priceLabel()}</strong>
                    </div>
                    <div class="pm-asset-trade-modal__summary-row">
                      <span class="pm-asset-trade-modal__summary-label">
                        Amount ({props.mode === "buy" ? props.paymentTokenMeta.symbol : props.asset.symbol})
                      </span>
                      <strong class="pm-asset-trade-modal__summary-value">
                        {amountLabel()
                          ? `${amountLabel()} ${props.mode === "buy" ? props.paymentTokenMeta.symbol : props.asset.symbol}`
                          : "Pending"}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__summary-row">
                      <span class="pm-asset-trade-modal__summary-label">
                        {props.mode === "buy" ? "Est. tokens" : "Est. proceeds"}
                      </span>
                      <strong class="pm-asset-trade-modal__summary-value">
                        {estimateLabel() ?? "Pending"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div class="pm-asset-trade-modal__status">
                  <Show when={status() === "working"}>
                    <span class="pm-asset-trade-modal__spinner" aria-hidden="true" />
                  </Show>

                  <div class="pm-asset-trade-modal__status-copy">
                    <p class="pm-asset-trade-modal__status-title">{statusTitle()}</p>
                    <p
                      class={`pm-asset-trade-modal__feedback${
                        status() === "error" ? " pm-asset-trade-modal__feedback--error" : ""
                      }`}
                    >
                      {errorMessage() ?? statusMessage() ?? "Preparing trade..."}
                    </p>
                  </div>
                </div>

                <Show when={result()?.tx_hash || transactionHashes().length > 0}>
                  <div class="pm-asset-trade-modal__hash-list">
                    <Show when={transactionHashes().length === 1}>
                      <p class="pm-asset-trade-modal__hash">
                        Transaction hash: {transactionHashes()[0]}
                      </p>
                    </Show>
                    <Show when={transactionHashes().length > 1}>
                      <p class="pm-asset-trade-modal__hash">
                        Approval hash: {transactionHashes()[0]}
                      </p>
                      <p class="pm-asset-trade-modal__hash">
                        Trade hash: {transactionHashes()[1]}
                      </p>
                    </Show>
                  </div>
                </Show>

                <Show when={status() !== "working"}>
                  <div class="pm-asset-trade-modal__actions">
                    <button
                      type="button"
                      class="pm-button pm-button--primary"
                      onClick={props.onClose}
                    >
                      Close
                    </button>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Portal>
  );
}
