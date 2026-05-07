import { For, Show, createEffect, createMemo, createSignal } from "solid-js";

import {
  formatAssetTokenBaseUnits,
  formatPaymentTokenAmountFromBaseUnits,
  formatUsdcBaseUnits,
  parseAssetTokenAmountInput,
  parseUsdcAmountInput,
  type AssetDetailResponse,
  type AssetResponse,
  type GaslessAssetActionResponse,
  type PaymentTokenDisplayMeta,
} from "~/lib";
import { readStoredAuthSession } from "~/lib/auth/session";

import AssetTradeModal from "./AssetTradeModal";
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
  subcopy: string;
  valueLabel: string;
}

const quickAmounts = ["1", "5", "10", "25", "100"];

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

function addQuickUsdcAmount(currentValue: string, nextValue: string): string {
  try {
    const currentBaseUnits = currentValue.trim()
      ? BigInt(parseUsdcAmountInput(currentValue).baseUnits)
      : 0n;
    const nextBaseUnits = BigInt(parseUsdcAmountInput(nextValue).baseUnits);
    return formatUsdcBaseUnits((currentBaseUnits + nextBaseUnits).toString());
  } catch {
    return nextValue;
  }
}

export default function AssetTradePanel(props: AssetTradePanelProps) {
  const [mode, setMode] = createSignal<PriceMode>("buy");
  const [amount, setAmount] = createSignal("");
  const [panelError, setPanelError] = createSignal<string | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  let lastAssetAddress = "";

  const quotes = createMemo<AssetTradeQuote[]>(() => [
    {
      label: "Subscription",
      mode: "buy",
      subcopy: "Primary issue",
      valueLabel: formatPaymentTokenAmountFromBaseUnits(
        props.asset.price_per_token,
        props.paymentTokenMeta,
      ),
    },
    {
      label: "Redemption",
      mode: "sell",
      subcopy: "Treasury exit",
      valueLabel: formatPaymentTokenAmountFromBaseUnits(
        props.asset.redemption_price_per_token,
        props.paymentTokenMeta,
      ),
    },
  ]);

  const selectedQuote = createMemo(
    () => quotes().find(quote => quote.mode === mode()) ?? quotes()[0],
  );

  const normalizedAmount = createMemo(() =>
    mode() === "buy"
      ? normalizeBuyAssetAmount(amount(), props.asset)
      : normalizeSellAssetAmount(amount()),
  );

  const estimateLabel = createMemo(() => {
    const value = normalizedAmount();

    if (!value) {
      return null;
    }

    if (mode() === "buy") {
      return `${formatCompactAssetAmount(value)} ${props.asset.symbol}`;
    }

    const proceeds = calculateRedemptionValue(value, props.asset);
    return proceeds
      ? formatPaymentTokenAmountFromBaseUnits(proceeds, props.paymentTokenMeta)
      : null;
  });

  const canBuy = createMemo(
    () =>
      props.asset.self_service_purchase_enabled &&
      (props.detail?.compliance_rules?.subscriptions_enabled ?? true),
  );
  const canSell = createMemo(() => props.detail?.compliance_rules?.redemptions_enabled ?? true);

  const submitLabel = createMemo(() =>
    mode() === "buy" ? "Buy Subscription" : "Sell Redemption",
  );

  const inputLabel = createMemo(() =>
    mode() === "buy" ? `Amount (${props.paymentTokenMeta.symbol})` : `Amount (${props.asset.symbol})`,
  );

  const inputHint = createMemo(() =>
    mode() === "buy"
      ? `Enter how much ${props.paymentTokenMeta.symbol} you want to buy.`
      : `Enter how many ${props.asset.symbol} tokens you want to redeem.`,
  );

  const switchMode = (nextMode: PriceMode) => {
    if (nextMode === mode()) {
      return;
    }

    setMode(nextMode);
    setAmount("");
    setPanelError(null);
    props.onModeChange(nextMode);
  };

  createEffect(() => {
    const nextAssetAddress = props.asset.asset_address;

    if (nextAssetAddress === lastAssetAddress) {
      return;
    }

    lastAssetAddress = nextAssetAddress;
    setMode("buy");
    setAmount("");
    setPanelError(null);
    setModalOpen(false);
    props.onModeChange("buy");
  });

  const handleSubmit = () => {
    setPanelError(null);

    if (!normalizedAmount()) {
      setPanelError(
        mode() === "buy"
          ? `Enter a valid ${props.paymentTokenMeta.symbol} amount to continue.`
          : "Enter a valid token amount to continue.",
      );
      return;
    }

    if (mode() === "buy" && !canBuy()) {
      setPanelError("Subscriptions are currently disabled for this asset.");
      return;
    }

    if (mode() === "sell" && !canSell()) {
      setPanelError("Redemptions are currently disabled for this asset.");
      return;
    }

    const session = readStoredAuthSession();

    if (!session?.token) {
      setPanelError("Sign in to place a trade.");

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guardrail:open-auth-modal"));
      }

      return;
    }

    if (session.user.wallet?.account_kind !== "smart_account") {
      setPanelError("Reconnect with your linked smart-account wallet to trade this asset.");
      return;
    }

    setModalOpen(true);
  };

  return (
    <aside class="pm-asset-market__trade-panel pm-trade-panel">
      <div class="pm-trade-panel__market">
        <p class="pm-trade-panel__label">Trade ticket</p>
        <p class="pm-trade-panel__headline">
          {props.asset.symbol} · {selectedQuote()?.valueLabel ?? "--"}
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
          onClick={() => switchMode("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          class="pm-trade-panel__mode-tab"
          classList={{ "pm-trade-panel__mode-tab--active": mode() === "sell" }}
          onClick={() => switchMode("sell")}
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
              onClick={() => switchMode(quote.mode)}
            >
              <span class="pm-trade-panel__quote-label">{quote.label}</span>
              <strong class="pm-trade-panel__quote-value">{quote.valueLabel}</strong>
              <span class="pm-trade-panel__quote-lane">{quote.subcopy}</span>
            </button>
          )}
        </For>
      </div>

      <div class="pm-trade-panel__ticket-grid">
        <div class="pm-trade-panel__meta-row">
          <span class="pm-trade-panel__meta-label">Lane</span>
          <strong class="pm-trade-panel__meta-value">{selectedQuote()?.subcopy ?? "--"}</strong>
        </div>

        <Show when={estimateLabel()}>
          <div class="pm-trade-panel__meta-row">
            <span class="pm-trade-panel__meta-label">
              {mode() === "buy" ? "Est. tokens" : "Est. proceeds"}
            </span>
            <strong class="pm-trade-panel__meta-value">{estimateLabel()}</strong>
          </div>
        </Show>
      </div>

      <label class="pm-trade-panel__amount">
        <span class="pm-trade-panel__amount-label">{inputLabel()}</span>
        <div class="pm-trade-panel__amount-box">
          <Show when={mode() === "buy"}>
            <span class="pm-trade-panel__amount-currency">$</span>
          </Show>

          <input
            type="text"
            inputmode="decimal"
            value={amount()}
            onInput={event => {
              setAmount(event.currentTarget.value);
              setPanelError(null);
            }}
            placeholder="0"
            aria-label="Trade amount"
          />

          <Show when={mode() === "sell"}>
            <span class="pm-trade-panel__amount-unit">{props.asset.symbol}</span>
          </Show>
        </div>
      </label>

      <Show when={mode() === "buy"}>
        <div class="pm-trade-panel__quick-picks">
          <For each={quickAmounts}>
            {value => (
              <button type="button" onClick={() => setAmount(current => addQuickUsdcAmount(current, value))}>
                +${value}
              </button>
            )}
          </For>
        </div>
      </Show>

      <p class="pm-trade-panel__hint">{inputHint()}</p>

      <button
        type="button"
        class="pm-button pm-button--primary pm-trade-panel__submit"
        disabled={mode() === "buy" ? !canBuy() : !canSell()}
        onClick={handleSubmit}
      >
        {submitLabel()}
      </button>

      <Show when={panelError()}>
        <p class="pm-trade-panel__feedback pm-trade-panel__feedback--error">{panelError()}</p>
      </Show>

      <p class="pm-trade-panel__footnote">
        Orders route through the smart-account trade flow. The modal only appears once execution
        starts.
      </p>

      <AssetTradeModal
        asset={props.asset}
        detail={props.detail}
        mode={mode()}
        onClose={() => setModalOpen(false)}
        onCompleted={props.onCompleted}
        open={modalOpen()}
        paymentTokenMeta={props.paymentTokenMeta}
        requestedAmount={amount()}
      />
    </aside>
  );
}
