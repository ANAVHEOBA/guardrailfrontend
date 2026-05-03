import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

import {
  assetClient,
  formatPaymentTokenAmountFromBaseUnits,
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
  const normalized = value.replaceAll(",", "").trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? normalized : null;
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
  const canBuy = createMemo(
    () =>
      props.asset.self_service_purchase_enabled &&
      (props.detail?.compliance_rules?.subscriptions_enabled ?? true),
  );
  const canSell = createMemo(() => props.detail?.compliance_rules?.redemptions_enabled ?? true);
  const projectedSettlementLabel = createMemo(() => {
    const amount = normalizedAmount();
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
    props.detail?.holder;
    setHolder(props.detail?.holder ?? null);
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

    const amount = normalizedAmount();

    if (!amount) {
      setErrorMessage("Enter a valid amount to continue.");
      setStatusMessage(null);
      return;
    }

    if (props.mode === "buy" && !canBuy()) {
      setErrorMessage("Buying is currently unavailable for this asset.");
      setStatusMessage(null);
      return;
    }

    if (props.mode === "sell" && !canSell()) {
      setErrorMessage("Selling is currently unavailable for this asset.");
      setStatusMessage(null);
      return;
    }

    const session = authSession();

    if (!session?.token) {
      setErrorMessage("Sign in with a linked wallet to continue.");
      setStatusMessage(null);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("guardrail:open-auth-modal"));
      }

      return;
    }

    setIsSubmitting(true);
    setStatusMessage(props.mode === "buy" ? "Preparing buy..." : "Preparing sell...");
    setErrorMessage(null);
    setResult(null);

    try {
      const previewResponse =
        preview() ??
        (props.mode === "buy"
          ? await assetClient.previewPurchase(props.asset.asset_address, { token_amount: amount })
          : await assetClient.previewRedemption(props.asset.asset_address, { token_amount: amount }));

      setPreview(previewResponse);

      if (props.mode === "buy") {
        if (allowanceNeedsApproval(holder(), previewResponse.value)) {
          setStatusMessage("Approving payment token...");
          const approvalResponse = await assetClient.approvePaymentToken(
            session.token,
            props.asset.asset_address,
            { amount: previewResponse.value },
          );
          setHolder(approvalResponse.holder);
          props.onCompleted(approvalResponse);
        }

        setStatusMessage("Submitting buy...");
        const response = await assetClient.purchaseAsset(session.token, props.asset.asset_address, {
          token_amount: amount,
        });

        setResult(response);
        setHolder(response.holder);
        props.onCompleted(response);
        setStatusMessage("Buy submitted.");
      } else {
        setStatusMessage("Submitting sell...");
        const response = await assetClient.redeemAsset(session.token, props.asset.asset_address, {
          amount,
        });

        setResult(response);
        setHolder(response.holder);
        props.onCompleted(response);
        setStatusMessage("Sell submitted.");
      }
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
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
                    <span class="pm-asset-trade-modal__label">Token amount</span>
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
                        {formatPaymentTokenAmountFromBaseUnits(
                          holder()?.payment_token_balance ?? null,
                          props.paymentTokenMeta,
                        )}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">Asset balance</span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {holder()?.balance ?? "Sign in to view"}
                      </strong>
                    </div>
                    <div class="pm-asset-trade-modal__metric">
                      <span class="pm-asset-trade-modal__metric-label">Allowance</span>
                      <strong class="pm-asset-trade-modal__metric-value">
                        {formatPaymentTokenAmountFromBaseUnits(
                          holder()?.payment_token_allowance_to_treasury ?? null,
                          props.paymentTokenMeta,
                        )}
                      </strong>
                    </div>
                  </div>

                  <Show when={previewStatus() === "error" && previewError()}>
                    <p class="pm-asset-trade-modal__feedback pm-asset-trade-modal__feedback--error">
                      {previewError()}
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
