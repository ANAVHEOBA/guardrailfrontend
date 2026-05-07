import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  assetClient,
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

interface AssetTradePanelProps {
  asset: AssetResponse;
  detail: AssetDetailResponse | null;
  onCompleted: (response: GaslessAssetActionResponse) => void;
  onModeChange: (mode: PriceMode) => void;
  paymentTokenMeta: PaymentTokenDisplayMeta;
  question?: string;
}

interface AssetTradeQuote {
  label: string;
  mode: PriceMode;
  valueLabel: string;
}

const quickAmounts = ["1", "5", "10", "100"];
type TradeMode = "buy" | "sell";

function getTradeErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const errorCode = (error as { code?: unknown }).code;

    if (errorCode === 4001) {
      return "Request rejected in your wallet.";
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

function normalizeSellAssetAmount(value: string): string | null {
  try {
    return parseAssetTokenAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}

function normalizeBuyAssetAmount(
  value: string,
  asset: AssetResponse,
): string | null {
  try {
    const usdcAmount = BigInt(parseUsdcAmountInput(value).baseUnits);
    const subscriptionPrice = BigInt(asset.price_per_token);

    if (subscriptionPrice <= 0n) {
      return null;
    }

    const tokenAmount = (usdcAmount * 10n ** 18n) / subscriptionPrice;

    return tokenAmount > 0n ? tokenAmount.toString() : null;
  } catch {
    return null;
  }
}

export default function AssetTradePanel(props: AssetTradePanelProps) {
  const [mode, setMode] = createSignal<TradeMode>("buy");
  const [amount, setAmount] = createSignal("0");
  const [isSubmitting, setSubmitting] = createSignal(false);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<GaslessAssetActionResponse | null>(null);
  const [transactionHashes, setTransactionHashes] = createSignal<string[]>([]);
  const [holder, setHolder] = createSignal<AssetHolderStateResponse | null>(props.detail?.holder ?? null);
  const quotes = createMemo<AssetTradeQuote[]>(() => [
    {
      label: "Subscription",
      mode: "buy",
      valueLabel: formatPaymentTokenAmountFromBaseUnits(
        props.asset.price_per_token,
        props.paymentTokenMeta,
      ),
    },
    {
      label: "Redemption",
      mode: "sell",
      valueLabel: formatPaymentTokenAmountFromBaseUnits(
        props.asset.redemption_price_per_token,
        props.paymentTokenMeta,
      ),
    },
  ]);
  const selectedQuote = createMemo(
    () => quotes().find(quote => quote.mode === mode()) ?? quotes()[0],
  );
  const submitLabel = createMemo(() => {
    const actionLabel = mode() === "buy" ? "Buy" : "Sell";
    const outcomeLabel = selectedQuote()?.label ?? "Quote";

    if (isSubmitting()) {
      return mode() === "buy" ? "Submitting buy..." : "Submitting sell...";
    }

    return `${actionLabel} ${outcomeLabel}`;
  });
  const latestTransactionHash = createMemo(
    () => transactionHashes()[transactionHashes().length - 1] ?? result()?.tx_hash ?? null,
  );
  const canBuy = createMemo(
    () =>
      props.asset.self_service_purchase_enabled &&
      (props.detail?.compliance_rules?.subscriptions_enabled ?? true),
  );
  const canSell = createMemo(() => props.detail?.compliance_rules?.redemptions_enabled ?? true);

  createEffect(() => {
    props.asset.asset_address;
    setMode("buy");
    props.onModeChange("buy");
    setAmount("0");
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setHolder(props.detail?.holder ?? null);
  });

  createEffect(() => {
    const nextHolder = props.detail?.holder ?? null;

    if (!nextHolder && holder() && result()) {
      return;
    }

    setHolder(nextHolder);
  });

  createEffect(() => {
    props.onModeChange(mode());
  });

  const handleSubmit = async () => {
    if (isSubmitting()) {
      return;
    }

    const session = readStoredAuthSession();

    if (!session?.token) {
      setStatusMessage(null);
      setErrorMessage("Sign in to place a trade.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guardrail:open-auth-modal"));
      }

      return;
    }

    if (session.user.wallet?.account_kind !== "smart_account") {
      setStatusMessage(null);
      setErrorMessage("Reconnect with your linked smart-account wallet to trade this asset.");
      return;
    }

    const normalizedAmount =
      mode() === "buy"
        ? normalizeBuyAssetAmount(amount(), props.asset)
        : normalizeSellAssetAmount(amount());

    if (!normalizedAmount) {
      setStatusMessage(null);
      setErrorMessage(
        mode() === "buy"
          ? "Enter a valid USDC amount to buy."
          : "Enter a valid token amount to sell.",
      );
      return;
    }

    if (mode() === "buy" && !canBuy()) {
      setStatusMessage(null);
      setErrorMessage("Buying is currently unavailable for this asset.");
      return;
    }

    if (mode() === "sell" && !canSell()) {
      setStatusMessage(null);
      setErrorMessage("Selling is currently unavailable for this asset.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setResult(null);
    setTransactionHashes([]);
    setStatusMessage(mode() === "buy" ? "Submitting buy..." : "Submitting sell...");

    try {
      if (mode() === "buy") {
        const preview = await assetClient.previewPurchase(props.asset.asset_address, {
          token_amount: normalizedAmount,
        });
        const hashes: string[] = [];
        let nextHolder = holder();
        const walletAddress = session.user.wallet?.wallet_address?.trim();

        if (!nextHolder && walletAddress) {
          nextHolder = await assetClient.fetchAssetHolderState(props.asset.asset_address, walletAddress);
          setHolder(nextHolder);
        }

        if (allowanceNeedsApproval(nextHolder, preview.value)) {
          setStatusMessage("Approving payment token...");

          const approvalResponse = await assetClient.approvePaymentToken(
            session.token,
            props.asset.asset_address,
            { amount: preview.value },
          );

          nextHolder = approvalResponse.holder;
          setHolder(approvalResponse.holder);
          props.onCompleted(approvalResponse);

          if (approvalResponse.tx_hash) {
            hashes.push(approvalResponse.tx_hash);
          }
        }

        setStatusMessage("Submitting buy...");

        const response = await assetClient.purchaseAsset(session.token, props.asset.asset_address, {
          token_amount: normalizedAmount,
        });

        setResult(response);
        setHolder(response.holder);
        props.onCompleted(response);

        if (response.tx_hash) {
          hashes.push(response.tx_hash);
        }

        setTransactionHashes(hashes);
        setStatusMessage("Trade submitted.");
        return;
      }

      const response = await assetClient.redeemAsset(session.token, props.asset.asset_address, {
        amount: normalizedAmount,
      });

      setResult(response);
      setHolder(response.holder);
      props.onCompleted(response);
      setTransactionHashes(response.tx_hash ? [response.tx_hash] : []);
      setStatusMessage("Trade submitted.");
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getTradeErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside class="pm-asset-market__trade-panel pm-trade-panel">
      <div class="pm-trade-panel__market">
        <p class="pm-trade-panel__label">{props.asset.symbol}</p>
        <p class="pm-trade-panel__headline">
          {selectedQuote()?.label ?? "Quote"} {selectedQuote()?.valueLabel ?? "--"}
        </p>
        <p class="pm-trade-panel__subcopy">
          {props.question ?? "Choose subscription or redemption pricing and enter your size."}
        </p>
      </div>

      <div class="pm-trade-panel__mode">
        <button
          type="button"
          class="pm-trade-panel__mode-tab"
          classList={{ "pm-trade-panel__mode-tab--active": mode() === "buy" }}
          onClick={() => setMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          class="pm-trade-panel__mode-tab"
          classList={{ "pm-trade-panel__mode-tab--active": mode() === "sell" }}
          onClick={() => setMode("sell")}
        >
          Sell
        </button>
      </div>

      <div class="pm-trade-panel__quote-grid">
        <For each={quotes()}>
          {quote => (
            <button
              type="button"
              classList={{
                "pm-trade-panel__quote": true,
                "pm-trade-panel__quote--yes": quote.mode === "buy",
                "pm-trade-panel__quote--no": quote.mode === "sell",
                "pm-trade-panel__quote--selected": quote.mode === mode(),
              }}
              onClick={() => setMode(quote.mode)}
            >
              <span>{quote.label}</span>
              <strong>{quote.valueLabel}</strong>
            </button>
          )}
        </For>
      </div>

      <label class="pm-trade-panel__amount">
        <span class="pm-trade-panel__amount-label">
          {mode() === "buy" ? "Amount" : "Shares"}
        </span>
        <div class="pm-trade-panel__amount-box">
          <Show when={mode() === "buy"}>
            <span class="pm-trade-panel__amount-currency">$</span>
          </Show>
          <input
            type="text"
            inputmode="decimal"
            value={amount()}
            onInput={event => setAmount(event.currentTarget.value)}
            aria-label="Trade amount"
          />
        </div>
      </label>

      <Show when={mode() === "buy"}>
        <div class="pm-trade-panel__quick-picks">
          <For each={quickAmounts}>
            {value => (
              <button type="button" onClick={() => setAmount(value)}>
                +${value}
              </button>
            )}
          </For>
        </div>
      </Show>

      <button
        type="button"
        class="pm-button pm-button--primary pm-trade-panel__submit"
        disabled={isSubmitting() || (mode() === "buy" ? !canBuy() : !canSell())}
        onClick={() => void handleSubmit()}
      >
        {submitLabel()}
      </button>

      <Show when={statusMessage()}>
        <p class="pm-trade-panel__feedback">{statusMessage()}</p>
      </Show>

      <Show when={errorMessage()}>
        <p class="pm-trade-panel__feedback pm-trade-panel__feedback--error">
          {errorMessage()}
        </p>
      </Show>

      <Show when={result()}>
        <div class="pm-trade-panel__summary">
          <p>
            {mode() === "buy" ? "Buy" : "Sell"} {props.asset.symbol} at{" "}
            {selectedQuote()?.valueLabel ?? "--"}
          </p>
          <p>Backend submitted the trade.</p>
          <Show when={latestTransactionHash()}>
            <p class="pm-trade-panel__hash">{latestTransactionHash()}</p>
          </Show>
        </div>
      </Show>

      <Show when={transactionHashes().length > 1}>
        <div class="pm-trade-panel__tx-list">
          <For each={transactionHashes()}>
            {(hash, index) => (
              <p class="pm-trade-panel__hash">
                Tx {index() + 1}: {hash}
              </p>
            )}
          </For>
        </div>
      </Show>

      <p class="pm-trade-panel__footnote">
        Asset trades use the backend gasless smart-account flow. Buys preview settlement before
        submission when approval is required.
      </p>
    </aside>
  );
}
