import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

import {
  assetClient,
  formatAssetTokenBaseUnits,
  formatPaymentTokenAmountFromBaseUnits,
  parseAssetTokenAmountInput,
  type AssetDetailResponse,
  type AssetHolderStateResponse,
  type AssetPreviewResponse,
  type AssetResponse,
  type GaslessAssetActionResponse,
  type PaymentTokenDisplayMeta,
} from "~/lib";
import { getErrorMessage } from "~/lib/api";
import {
  AUTH_SESSION_CHANGE_EVENT,
  readStoredAuthSession,
  type StoredAuthSession,
} from "~/lib/auth/session";

import type { PriceMode } from "./types";

interface AssetTradeModalProps {
  asset: AssetResponse;
  detail: AssetDetailResponse | null;
  mode: PriceMode;
  onClose: () => void;
  onCompleted: (response: GaslessAssetActionResponse) => void;
  onModeChange: (mode: PriceMode) => void;
  open: boolean;
  paymentTokenMeta: PaymentTokenDisplayMeta;
}

type PreviewStatus = "idle" | "loading" | "ready" | "error";

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

function normalizeTradeAmount(value: string): string | null {
  try {
    return parseAssetTokenAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}

function formatEstimatedDisplay(value: number, symbol: string): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value)} ${symbol}`;
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

export default function AssetTradeModal(props: AssetTradeModalProps) {
  const [authSession, setAuthSession] = createSignal<StoredAuthSession | null>(null);
  const [holder, setHolder] = createSignal<AssetHolderStateResponse | null>(props.detail?.holder ?? null);
  const [amountInput, setAmountInput] = createSignal("");
  const [previewStatus, setPreviewStatus] = createSignal<PreviewStatus>("idle");
  const [previewError, setPreviewError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<AssetPreviewResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [statusMessage, setStatusMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<GaslessAssetActionResponse | null>(null);
  let previewRequestId = 0;
  let holderRequestId = 0;

  const normalizedAmount = createMemo(() => normalizeTradeAmount(amountInput()));
  const displayAmount = createMemo(() => {
    try {
      return parseAssetTokenAmountInput(amountInput()).displayAmount;
    } catch {
      return null;
    }
  });
  const canBuy = createMemo(
    () =>
      props.asset.self_service_purchase_enabled &&
      (props.detail?.compliance_rules?.subscriptions_enabled ?? true),
  );
  const canSell = createMemo(() => props.detail?.compliance_rules?.redemptions_enabled ?? true);
  const hasSmartAccountSession = createMemo(
    () => authSession()?.user.wallet?.account_kind === "smart_account",
  );
  const projectedSettlementLabel = createMemo(() => {
    const amount = displayAmount();
    const priceRaw =
      props.mode === "buy" ? props.asset.price_per_token : props.asset.redemption_price_per_token;
    const decimals = props.paymentTokenMeta.decimals;
    const displayPrice = Number(priceRaw) / 10 ** decimals;
    const parsedAmount = amount ? Number(amount) : Number.NaN;

    if (!Number.isFinite(displayPrice) || displayPrice <= 0 || !Number.isFinite(parsedAmount)) {
      return null;
    }

    return formatEstimatedDisplay(parsedAmount * displayPrice, props.paymentTokenMeta.symbol);
  });
  const previewLabel = createMemo(() => {
    const activePreview = preview();

    if (activePreview) {
      return formatPaymentTokenAmountFromBaseUnits(activePreview.value, props.paymentTokenMeta);
    }

    return projectedSettlementLabel();
  });
  const approvalRequired = createMemo(
    () =>
      props.mode === "buy" &&
      Boolean(preview()) &&
      allowanceNeedsApproval(holder(), preview()!.value),
  );
  const walletCashLabel = createMemo(() => {
    const currentHolder = holder();
    const balance = currentHolder?.payment_token_balance;
    const label = currentHolder
      ? formatPaymentTokenAmountFromBaseUnits(balance ?? null, props.paymentTokenMeta)
      : authSession()?.token
        ? "Unavailable"
        : "Sign in to view";
    
    console.log("💰 walletCashLabel computed:", {
      holder: currentHolder,
      balance,
      label,
    });
    
    return label;
  });
  
  const assetBalanceLabel = createMemo(() => {
    const currentHolder = holder();
    const balance = currentHolder?.balance;
    const label = currentHolder ? formatAssetTokenBaseUnits(balance ?? null) : "Sign in to view";
    
    console.log("📊 assetBalanceLabel computed:", {
      holder: currentHolder,
      balance,
      label,
    });
    
    return label;
  });
  
  const secondaryAssetMetricLabel = createMemo(() =>
    props.mode === "buy" ? "Allowance" : "Unlocked balance",
  );
  
  const secondaryAssetMetricValue = createMemo(() => {
    const currentHolder = holder();
    
    if (!currentHolder) {
      return authSession()?.token ? "Unavailable" : "Sign in to view";
    }

    if (props.mode === "buy") {
      const allowance = currentHolder?.payment_token_allowance_to_treasury;
      const label = formatPaymentTokenAmountFromBaseUnits(
        allowance ?? null,
        props.paymentTokenMeta,
      );
      
      console.log("🔓 Allowance computed:", {
        holder: currentHolder,
        allowance,
        label,
      });
      
      return label;
    }

    const unlockedBalance = currentHolder?.unlocked_balance;
    const label = formatAssetTokenBaseUnits(unlockedBalance ?? null);
    
    console.log("🔓 Unlocked balance computed:", {
      holder: currentHolder,
      unlockedBalance,
      label,
    });
    
    return label;
  });

  createEffect(() => {
    if (!props.open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
    if (typeof window === "undefined") {
      return;
    }

    const handleSessionChange = (event: Event) => {
      const detail = (event as CustomEvent<StoredAuthSession | null>).detail;
      setAuthSession(detail ?? readStoredAuthSession());
    };

    setAuthSession(readStoredAuthSession());
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange as EventListener);

    onCleanup(() => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange as EventListener);
    });
  });

  createEffect(() => {
    const newHolder = props.detail?.holder;
    console.log("🔄 AssetTradeModal: detail.holder changed");
    console.log("  - New holder from props:", newHolder);
    console.log("  - Current holder state:", holder());
    setHolder(newHolder ?? null);
    console.log("  - Holder state updated to:", holder());
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }

    props.mode;
    setStatusMessage(null);
    setErrorMessage(null);
    setResult(null);
  });

  createEffect(() => {
    if (!props.open) {
      setAmountInput("");
      setPreviewStatus("idle");
      setPreviewError(null);
      setPreview(null);
      setIsSubmitting(false);
      setStatusMessage(null);
      setErrorMessage(null);
      setResult(null);
      return;
    }

    setAuthSession(readStoredAuthSession());
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const walletAddress = authSession()?.user.wallet?.wallet_address?.trim();

    if (!walletAddress) {
      setHolder(props.detail?.holder ?? null);
      return;
    }

    const version = ++holderRequestId;
    void assetClient
      .fetchAssetHolderState(props.asset.asset_address, walletAddress)
      .then(response => {
        if (version !== holderRequestId) {
          return;
        }

        setHolder(response);
      })
      .catch(() => {
        if (version !== holderRequestId) {
          return;
        }

        setHolder(props.detail?.holder ?? null);
      });
  });

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const amount = normalizedAmount();

    if (!amount) {
      setPreviewStatus("idle");
      setPreviewError(null);
      setPreview(null);
      return;
    }

    const requestId = ++previewRequestId;
    setPreviewStatus("loading");
    setPreviewError(null);

    const timeoutId = window.setTimeout(() => {
      const request =
        props.mode === "buy"
          ? assetClient.previewPurchase(props.asset.asset_address, { token_amount: amount })
          : assetClient.previewRedemption(props.asset.asset_address, { token_amount: amount });

      void request
        .then(response => {
          if (requestId !== previewRequestId) {
            return;
          }

          setPreview(response);
          setPreviewStatus("ready");
        })
        .catch(error => {
          if (requestId !== previewRequestId) {
            return;
          }

          setPreview(null);
          setPreviewStatus("error");
          setPreviewError(getErrorMessage(error));
        });
    }, 180);

    onCleanup(() => {
      window.clearTimeout(timeoutId);
    });
  });

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();

    console.log("=== ASSET TRADE SUBMIT STARTED ===");
    console.log("Mode:", props.mode);
    console.log("Asset:", props.asset.symbol, props.asset.asset_address);

    const amount = normalizedAmount();
    console.log("Normalized amount:", amount);

    if (!amount) {
      console.log("❌ No amount provided");
      setErrorMessage("Enter a valid amount to continue.");
      setStatusMessage(null);
      return;
    }

    if (props.mode === "buy" && !canBuy()) {
      console.log("❌ Buying not enabled");
      setErrorMessage("Buying is currently unavailable for this asset.");
      setStatusMessage(null);
      return;
    }

    if (props.mode === "sell" && !canSell()) {
      console.log("❌ Selling not enabled");
      setErrorMessage("Selling is currently unavailable for this asset.");
      setStatusMessage(null);
      return;
    }

    const session = authSession();
    console.log("Auth session:", session ? "✓ Present" : "✗ Missing");
    console.log("User wallet:", session?.user.wallet?.wallet_address);

    if (!session?.token) {
      console.log("❌ No auth token");
      setErrorMessage("Sign in with a linked wallet to continue.");
      setStatusMessage(null);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guardrail:open-auth-modal"));
      }

      return;
    }

    if (!hasSmartAccountSession()) {
      console.log("❌ Not a smart account session");
      setErrorMessage(
        "Asset trading requires a linked smart-account wallet for the gasless execution flow.",
      );
      setStatusMessage(null);
      return;
    }

    console.log("✓ All validations passed, starting trade...");
    setIsSubmitting(true);
    setStatusMessage(props.mode === "buy" ? "Preparing buy..." : "Preparing sell...");
    setErrorMessage(null);
    setResult(null);

    try {
      console.log("📊 Getting preview...");
      const previewResponse =
        preview() ??
        (props.mode === "buy"
          ? await assetClient.previewPurchase(props.asset.asset_address, { token_amount: amount })
          : await assetClient.previewRedemption(props.asset.asset_address, { token_amount: amount }));

      console.log("Preview response:", previewResponse);
      setPreview(previewResponse);

      if (props.mode === "buy") {
        console.log("💰 Processing BUY...");
        if (allowanceNeedsApproval(holder(), previewResponse.value)) {
          console.log("🔓 Approval needed, approving...");
          setStatusMessage("Approving payment token...");
          const approvalResponse = await assetClient.approvePaymentToken(
            session.token,
            props.asset.asset_address,
            { amount: previewResponse.value },
          );
          console.log("Approval response:", approvalResponse);
          setHolder(approvalResponse.holder);
          props.onCompleted(approvalResponse);
        }

        console.log("📤 Submitting purchase...");
        setStatusMessage("Submitting buy...");
        const response = await assetClient.purchaseAsset(session.token, props.asset.asset_address, {
          token_amount: amount,
        });

        console.log("✅ BUY SUCCESS!");
        console.log("Response:", response);
        console.log("New holder state:", response.holder);
        console.log("Transaction hash:", response.tx_hash);

        setResult(response);
        setHolder(response.holder);
        props.onCompleted(response);
        setStatusMessage("Buy submitted.");
      } else {
        console.log("💸 Processing SELL...");
        console.log("Current holder state BEFORE sell:", holder());
        console.log("  - Balance:", holder()?.balance);
        console.log("  - Unlocked balance:", holder()?.unlocked_balance);
        console.log("  - Payment token balance:", holder()?.payment_token_balance);

        setStatusMessage("Submitting sell...");
        console.log("📤 Calling assetClient.redeemAsset...");
        console.log("  - Token:", session.token.substring(0, 20) + "...");
        console.log("  - Asset address:", props.asset.asset_address);
        console.log("  - Amount:", amount);

        const response = await assetClient.redeemAsset(session.token, props.asset.asset_address, {
          amount,
        });

        console.log("✅ SELL SUCCESS!");
        console.log("Response:", response);
        console.log("New holder state AFTER sell:", response.holder);
        console.log("  - Balance:", response.holder?.balance);
        console.log("  - Unlocked balance:", response.holder?.unlocked_balance);
        console.log("  - Payment token balance:", response.holder?.payment_token_balance);
        console.log("Transaction hash:", response.tx_hash);

        console.log("📝 Updating local state...");
        setResult(response);
        setHolder(response.holder);
        console.log("✓ Local holder state updated");

        console.log("📢 Calling onCompleted callback...");
        props.onCompleted(response);
        console.log("✓ onCompleted callback executed");

        setStatusMessage("Sell submitted.");
        console.log("=== SELL COMPLETED SUCCESSFULLY ===");
      }
    } catch (error) {
      console.error("❌ TRADE FAILED!");
      console.error("Error:", error);
      console.error("Error message:", getErrorMessage(error));
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
      }
      setStatusMessage(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      console.log("=== ASSET TRADE SUBMIT ENDED ===");
    }
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div class="pm-asset-trade-modal__overlay" onClick={props.onClose}>
          <section
            class="pm-asset-trade-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-asset-trade-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div class="pm-asset-trade-modal__frame">
              <div class="pm-asset-trade-modal__header">
                <div>
                  <p class="pm-asset-trade-modal__eyebrow">Asset trade</p>
                  <h2 class="pm-asset-trade-modal__title" id="pm-asset-trade-modal-title">
                    {props.mode === "buy" ? "Buy" : "Sell"} {props.asset.symbol}
                  </h2>
                  <p class="pm-asset-trade-modal__subtitle">
                    Preview the settlement and submit through the asset user endpoints.
                  </p>
                </div>

                <button
                  class="pm-asset-trade-modal__close"
                  type="button"
                  aria-label="Close trade modal"
                  onClick={props.onClose}
                >
                  <CloseIcon />
                </button>
              </div>

              <div class="pm-asset-trade-modal__body">
                <div class="pm-asset-market__toggle">
                  <button
                    class={`pm-asset-market__toggle-button${
                      props.mode === "buy" ? " pm-asset-market__toggle-button--active" : ""
                    }`}
                    type="button"
                    onClick={() => props.onModeChange("buy")}
                  >
                    Buy
                  </button>
                  <button
                    class={`pm-asset-market__toggle-button${
                      props.mode === "sell" ? " pm-asset-market__toggle-button--active" : ""
                    }`}
                    type="button"
                    onClick={() => props.onModeChange("sell")}
                  >
                    Sell
                  </button>
                </div>

                <form class="pm-asset-trade-modal__form" onSubmit={handleSubmit}>
                  <label class="pm-asset-trade-modal__field">
                    <span class="pm-asset-trade-modal__label">Asset amount</span>
                    <input
                      type="text"
                      inputmode="decimal"
                      value={amountInput()}
                      placeholder="0.0"
                      onInput={event => setAmountInput(event.currentTarget.value)}
                    />
                  </label>

                  <div class="pm-asset-trade-modal__grid">
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">
                        {props.mode === "buy" ? "Estimated cost" : "Estimated proceeds"}
                      </span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {previewLabel() ?? "Not available"}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">Wallet cash</span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {walletCashLabel()}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">Asset balance</span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {assetBalanceLabel()}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">
                        {secondaryAssetMetricLabel()}
                      </span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {secondaryAssetMetricValue()}
                      </strong>
                    </div>
                  </div>

                  <Show when={previewStatus() === "loading"}>
                    <p class="pm-asset-trade-modal__feedback">Refreshing settlement preview...</p>
                  </Show>

                  <Show when={previewStatus() === "error" && previewError()}>
                    <p class="pm-asset-trade-modal__feedback pm-asset-trade-modal__feedback--error">
                      {previewError()}
                    </p>
                  </Show>

                  <Show when={approvalRequired()}>
                    <p class="pm-asset-trade-modal__feedback">
                      This buy will first approve the treasury to pull{" "}
                      {previewLabel() ?? "the previewed settlement amount"}, then submit the asset
                      purchase.
                    </p>
                  </Show>

                  <Show when={authSession()?.token && !hasSmartAccountSession()}>
                    <p class="pm-asset-trade-modal__feedback pm-asset-trade-modal__feedback--error">
                      This asset flow uses the backend gasless smart-account path. Reconnect with
                      your linked smart-account wallet before submitting a trade.
                    </p>
                  </Show>

                  <Show when={statusMessage()}>
                    <p class="pm-asset-trade-modal__feedback">{statusMessage()}</p>
                  </Show>

                  <Show when={errorMessage()}>
                    <p class="pm-asset-trade-modal__feedback pm-asset-trade-modal__feedback--error">
                      {errorMessage()}
                    </p>
                  </Show>

                  <Show when={result()}>
                    {response => (
                      <div class="pm-asset-market__modal-result">
                        <div class="pm-asset-trade-modal__metric">
                          <span class="pm-asset-trade-modal__metric-label">Transaction hash</span>
                          <strong class="pm-asset-trade-modal__metric-value pm-asset-trade-modal__metric-value--mono">
                            {response().tx_hash}
                          </strong>
                        </div>
                        <p class="pm-asset-market__modal-note">
                          The holder snapshot has been refreshed from the backend response.
                        </p>
                      </div>
                    )}
                  </Show>

                  <div class="pm-asset-trade-modal__actions">
                    <button class="pm-button pm-button--ghost" type="button" onClick={props.onClose}>
                      Close
                    </button>
                    <button
                      class="pm-button pm-button--primary"
                      type="submit"
                      disabled={
                        isSubmitting() ||
                        !normalizedAmount() ||
                        (props.mode === "buy" ? !canBuy() : !canSell())
                      }
                    >
                      {isSubmitting()
                        ? props.mode === "buy"
                          ? "Submitting buy..."
                          : "Submitting sell..."
                        : props.mode === "buy"
                          ? "Buy asset"
                          : "Sell asset"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
