import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, onCleanup, sharedConfig } from "solid-js";

import {
  assetClient,
  buildAssetAddressPageHref,
  buildAssetProposalPageHref,
  buildAssetSlugPageHref,
  DEFAULT_PAYMENT_TOKEN_DISPLAY_META,
  formatBaseUnitsLabel,
  formatMarketReferenceAmountFromBaseUnits,
  formatPaymentTokenAmountFromBaseUnits,
  type GaslessAssetActionResponse,
} from "~/lib";
import { getErrorMessage } from "~/lib/api";
import {
  AUTH_SESSION_CHANGE_EVENT,
  readStoredAuthSession,
  type StoredAuthSession,
} from "~/lib/auth/session";

import AssetDetailHero from "./AssetDetailHero";
import AssetDetailReferencePanels from "./AssetDetailReferencePanels";
import AssetDetailSourcesSection from "./AssetDetailSourcesSection";
import AssetDetailStatsSection from "./AssetDetailStatsSection";
import AssetDetailSummaryGrid from "./AssetDetailSummaryGrid";
import AssetTradeModal from "./AssetTradeModal";
import {
  loadAssetHistoryRange,
  primeAssetDetailBundle,
  readCachedAssetHistory,
  readCachedPaymentTokenQuote,
  readProjectedAssetDetailView,
} from "./data";
import {
  formatLookupLabel,
  readCategoryChips,
  readDisplayedRawPrice,
  readSpreadText,
  readStatusTone,
  readSummaryCopy,
} from "./format";
import {
  buildChartMetrics,
  buildHistoryChangeSummary,
  normalizeHistorySeries,
  readHistorySeries,
} from "./history";
import { LoadingState } from "./panels";
import type {
  AssetDetailScreenProps,
  DetailLoadStatus,
  DisplayedRoute,
  HistoryLoadStatus,
  PriceMode,
  TimeRange,
} from "./types";
import { TIME_RANGES } from "./types";

export default function AssetDetailScreen(props: AssetDetailScreenProps) {
  const initialIdentifier = props.identifier();
  const canUseProjectedInitialView =
    typeof window !== "undefined" && sharedConfig.done === true;
  const initialProjectedDetail = canUseProjectedInitialView
    ? readProjectedAssetDetailView(props.mode, initialIdentifier)
    : null;
  const initialHistory = canUseProjectedInitialView
    ? readCachedAssetHistory(props.mode, initialIdentifier, "1D")
    : null;
  const initialPaymentTokenQuote = canUseProjectedInitialView
    ? readCachedPaymentTokenQuote(props.mode, initialIdentifier)
    : null;
  const hasResolvedDetail = (value: typeof initialProjectedDetail) =>
    Boolean(
      value &&
        (
          value.treasury ||
          value.compliance_rules ||
          value.valuation ||
          value.holder ||
          value.unavailable_sections.length > 0
        ),
    );

  const [status, setStatus] = createSignal<DetailLoadStatus>(
    hasResolvedDetail(initialProjectedDetail) ? "ready" : "loading",
  );
  const [error, setError] = createSignal<string | null>(null);
  const [detail, setDetail] = createSignal(initialProjectedDetail);
  const [historyStatus, setHistoryStatus] = createSignal<HistoryLoadStatus>(
    initialHistory ? "ready" : "idle",
  );
  const [historyError, setHistoryError] = createSignal<string | null>(null);
  const [history, setHistory] = createSignal(initialHistory);
  const [paymentTokenQuote, setPaymentTokenQuote] = createSignal(initialPaymentTokenQuote);
  const [authSession, setAuthSession] = createSignal<StoredAuthSession | null>(null);
  const [priceMode, setPriceMode] = createSignal<PriceMode>("buy");
  const [timeRange, setTimeRange] = createSignal<TimeRange>("1D");
  const [showFullSummary, setShowFullSummary] = createSignal(false);
  const [copiedField, setCopiedField] = createSignal<string | null>(null);
  const [tradeModalOpen, setTradeModalOpen] = createSignal(false);
  let requestVersion = 0;
  let historyRequestVersion = 0;
  let holderRequestVersion = 0;
  let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

  const asset = createMemo(() => detail()?.asset ?? null);
  const title = createMemo(() => {
    const currentAsset = asset();
    return currentAsset ? `${currentAsset.name} | Guardrail` : "Asset detail | Guardrail";
  });
  const summary = createMemo(() => {
    const currentAsset = asset();
    return currentAsset ? readSummaryCopy(currentAsset) : "";
  });
  const isSummaryLong = createMemo(() => summary().length > 220);
  const summaryPreview = createMemo(() => {
    if (showFullSummary() || !isSummaryLong()) {
      return summary();
    }

    return `${summary().slice(0, 220).trimEnd()}...`;
  });
  const paymentTokenMeta = createMemo(() => ({
    symbol: paymentTokenQuote()?.payment_token_symbol ?? DEFAULT_PAYMENT_TOKEN_DISPLAY_META.symbol,
    decimals:
      paymentTokenQuote()?.payment_token_decimals ?? DEFAULT_PAYMENT_TOKEN_DISPLAY_META.decimals,
    marketCurrency:
      paymentTokenQuote()?.market_currency ?? DEFAULT_PAYMENT_TOKEN_DISPLAY_META.marketCurrency,
    marketCurrencyPerPaymentToken:
      paymentTokenQuote()?.market_currency_per_payment_token ??
      DEFAULT_PAYMENT_TOKEN_DISPLAY_META.marketCurrencyPerPaymentToken,
  }));
  const displayPrice = createMemo(() => {
    const currentAsset = asset();

    if (!currentAsset) {
      return "Not available";
    }

    return formatPaymentTokenAmountFromBaseUnits(
      readDisplayedRawPrice(currentAsset, priceMode()),
      paymentTokenMeta(),
    );
  });
  const rawPriceLabel = createMemo(() => {
    const currentAsset = asset();
    return currentAsset ? formatBaseUnitsLabel(readDisplayedRawPrice(currentAsset, priceMode())) : "Not available";
  });
  const marketReferencePrice = createMemo(() => {
    const currentAsset = asset();

    if (!currentAsset) {
      return null;
    }

    return formatMarketReferenceAmountFromBaseUnits(
      readDisplayedRawPrice(currentAsset, priceMode()),
      paymentTokenMeta(),
    );
  });
  const subscriptionSettlementPrice = createMemo(() => {
    const currentAsset = asset();
    return currentAsset
      ? formatPaymentTokenAmountFromBaseUnits(currentAsset.price_per_token, paymentTokenMeta())
      : "Not available";
  });
  const redemptionSettlementPrice = createMemo(() => {
    const currentAsset = asset();
    return currentAsset
      ? formatPaymentTokenAmountFromBaseUnits(
          currentAsset.redemption_price_per_token,
          paymentTokenMeta(),
        )
      : "Not available";
  });
  const subscriptionMarketReferencePrice = createMemo(() => {
    const currentAsset = asset();
    return currentAsset
      ? formatMarketReferenceAmountFromBaseUnits(currentAsset.price_per_token, paymentTokenMeta())
      : null;
  });
  const redemptionMarketReferencePrice = createMemo(() => {
    const currentAsset = asset();
    return currentAsset
      ? formatMarketReferenceAmountFromBaseUnits(
          currentAsset.redemption_price_per_token,
          paymentTokenMeta(),
        )
      : null;
  });
  const paymentTokenLabel = createMemo(() => {
    const currentAsset = asset();

    if (!currentAsset) {
      return "Not available";
    }

    return `${paymentTokenMeta().symbol} · ${currentAsset.payment_token_address.slice(0, 6)}...${currentAsset.payment_token_address.slice(-4)}`;
  });
  const historyCandles = createMemo(() => readHistorySeries(history(), priceMode()));
  const chartSeries = createMemo(() => {
    const currentAsset = asset();

    if (!currentAsset) {
      return [];
    }

    return normalizeHistorySeries(
      historyCandles(),
      readDisplayedRawPrice(currentAsset, priceMode()),
      paymentTokenMeta(),
    );
  });
  const chart = createMemo(() => buildChartMetrics(chartSeries()));
  const chartHasHistory = createMemo(() => chartSeries().length > 0);
  const chartChange = createMemo(() => buildHistoryChangeSummary(chartSeries(), timeRange()));
  const historyLabel = createMemo(() => {
    if (priceMode() === "buy") {
      return "Primary market history";
    }

    if ((history()?.underlying_market_price.length ?? 0) > 0) {
      return "Underlying market history";
    }

    return "Primary market history";
  });
  const categoryChips = createMemo(() => {
    const currentAsset = asset();
    return currentAsset ? readCategoryChips(currentAsset) : [];
  });
  const buyEnabled = createMemo(
    () =>
      Boolean(asset()?.self_service_purchase_enabled) &&
      (detail()?.compliance_rules?.subscriptions_enabled ?? true),
  );
  const sellEnabled = createMemo(() => detail()?.compliance_rules?.redemptions_enabled ?? true);

  const loadDetail = async (identifier: string) => {
    const version = ++requestVersion;
    const projectedDetail = readProjectedAssetDetailView(props.mode, identifier);
    const projectedHistory = readCachedAssetHistory(props.mode, identifier, "1D");
    const projectedPaymentTokenQuote = readCachedPaymentTokenQuote(props.mode, identifier);

    setStatus(hasResolvedDetail(projectedDetail) ? "ready" : "loading");
    setError(null);
    setDetail(projectedDetail);
    setShowFullSummary(false);
    setPriceMode("buy");
    setTimeRange("1D");
    setHistory(projectedHistory);
    setPaymentTokenQuote(projectedPaymentTokenQuote);
    setHistoryStatus(projectedHistory ? "ready" : "idle");
    setHistoryError(null);

    try {
      const bundle = await primeAssetDetailBundle(props.mode, identifier, "1D");

      if (version !== requestVersion) {
        return;
      }

      if (!bundle.detail.asset.visible) {
        throw new Error("Asset not available.");
      }

      setDetail(bundle.detail);
      setPaymentTokenQuote(bundle.paymentTokenQuote);
      setHistory(bundle.historyByRange["1D"] ?? null);
      setHistoryStatus(bundle.historyByRange["1D"] ? "ready" : "idle");
      setStatus("ready");
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (caughtError) {
      if (version !== requestVersion) {
        return;
      }

      setError(getErrorMessage(caughtError));
      setStatus("error");
    }
  };

  const loadHistory = async (identifier: string, range: TimeRange) => {
    const cachedHistory = readCachedAssetHistory(props.mode, identifier, range);

    if (cachedHistory) {
      setHistory(cachedHistory);
      setHistoryStatus("ready");
      setHistoryError(null);
      return;
    }

    const version = ++historyRequestVersion;
    setHistoryError(null);
    setHistoryStatus("loading");

    try {
      const nextHistory = await loadAssetHistoryRange(props.mode, identifier, range);

      if (version !== historyRequestVersion) {
        return;
      }

      setHistory(nextHistory);
      setHistoryStatus("ready");
    } catch (caughtError) {
      if (version !== historyRequestVersion) {
        return;
      }

      setHistory(null);
      setHistoryError(getErrorMessage(caughtError));
      setHistoryStatus("error");
    }
  };

  const syncHolderState = async () => {
    const currentAsset = asset();
    const walletAddress = authSession()?.user.wallet?.wallet_address?.trim();

    if (!currentAsset || !walletAddress) {
      return;
    }

    if (detail()?.holder?.wallet_address === walletAddress) {
      return;
    }

    const version = ++holderRequestVersion;

    try {
      const holder = await assetClient.fetchAssetHolderState(currentAsset.asset_address, walletAddress);

      if (version !== holderRequestVersion) {
        return;
      }

      setDetail(current => {
        if (!current || current.asset.asset_address !== currentAsset.asset_address) {
          return current;
        }

        return {
          ...current,
          holder,
        };
      });
    } catch {
      if (version !== holderRequestVersion) {
        return;
      }
    }
  };

  const copyValue = async (field: string, value: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);

      if (copyResetTimer) {
        clearTimeout(copyResetTimer);
      }

      copyResetTimer = setTimeout(() => {
        setCopiedField(current => (current === field ? null : current));
      }, 1600);
    } catch {
      // Ignore clipboard failures and keep the UI stable.
    }
  };

  const openTradeModal = (mode: PriceMode) => {
    setPriceMode(mode);
    setTradeModalOpen(true);
  };

  const applyTradeResult = (response: GaslessAssetActionResponse) => {
    setDetail(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        asset: response.asset,
        holder: response.holder,
      };
    });
  };

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const identifier = props.identifier().trim();

    if (!identifier) {
      setError("Asset identifier is missing.");
      setDetail(null);
      setStatus("error");
      return;
    }

    void loadDetail(identifier);
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const identifier = props.identifier().trim();
    const range = timeRange();

    if (!identifier) {
      return;
    }

    if (range === "1D") {
      const cachedHistory = readCachedAssetHistory(props.mode, identifier, range);

      if (cachedHistory) {
        setHistory(cachedHistory);
        setHistoryStatus("ready");
        setHistoryError(null);
      }

      return;
    }

    void loadHistory(identifier, range);
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSessionChange = (event: Event) => {
      const nextSession = (event as CustomEvent<StoredAuthSession | null>).detail;
      setAuthSession(nextSession ?? readStoredAuthSession());
    };

    setAuthSession(readStoredAuthSession());
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange as EventListener);

    onCleanup(() => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange as EventListener);
    });
  });

  createEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    authSession()?.user.wallet?.wallet_address;
    asset()?.asset_address;
    void syncHolderState();
  });

  onCleanup(() => {
    if (copyResetTimer) {
      clearTimeout(copyResetTimer);
    }
  });

  return (
    <main class="pm-page">
      <Title>{title()}</Title>

      <section class="pm-asset-detail-page">
        <div class="pm-browser__hero pm-asset-detail-page__hero">
          <div class="pm-asset-detail-page__hero-copy">
            <A class="pm-asset-detail__back-link" href="/assets">
              All assets
            </A>
            <p class="pm-asset-detail__eyebrow">Public asset detail</p>
          </div>
          <div class="pm-browser__button-row">
            <A class="pm-button pm-button--ghost" href="/assets">
              Back to catalog
            </A>
          </div>
        </div>

        <Show when={status() !== "loading"} fallback={<LoadingState />}>
          <Show
            when={!error()}
            fallback={
              <section class="pm-home__state pm-asset-detail__state-card">
                <p class="pm-home__state-title">Unable to load asset detail</p>
                <p class="pm-home__state-copy">{error()}</p>
                <button
                  class="pm-button pm-button--primary"
                  type="button"
                  onClick={() => void loadDetail(props.identifier().trim())}
                >
                  Retry
                </button>
              </section>
            }
          >
            <Show when={asset()}>
              {currentAsset => {
                const registryAsset = currentAsset();
                const assetDetail = detail();
                const statusTone = readStatusTone(registryAsset.asset_state_label);
                const displayedRoutes: DisplayedRoute[] = [
                  ...(registryAsset.slug
                    ? [
                        {
                          label: "Slug route",
                          value: registryAsset.slug,
                          href: buildAssetSlugPageHref(registryAsset.slug),
                        },
                        {
                          label: "Address route",
                          value: registryAsset.asset_address,
                          href: buildAssetAddressPageHref(registryAsset.asset_address),
                        },
                      ]
                    : []),
                  {
                    label: "Proposal route",
                    value: registryAsset.proposal_id,
                    href: buildAssetProposalPageHref(registryAsset.proposal_id),
                  },
                  {
                    label: "Address route",
                    value: registryAsset.asset_address,
                    href: buildAssetAddressPageHref(registryAsset.asset_address),
                  },
                ];

                return (
                  <>
                    <section class="pm-asset-market">
                      <AssetDetailHero
                        asset={registryAsset}
                        baseUnitsLabel={rawPriceLabel()}
                        buyEnabled={buyEnabled()}
                        categoryChips={categoryChips()}
                        chart={chart()}
                        chartChange={chartChange()}
                        chartHasHistory={chartHasHistory()}
                        copiedField={copiedField()}
                        displayPrice={displayPrice()}
                        history={history()}
                        historyError={historyError()}
                        historyLabel={historyLabel()}
                        historyStatus={historyStatus()}
                        isAuthenticated={Boolean(authSession()?.token)}
                        isSummaryLong={isSummaryLong()}
                        lookupLabel={formatLookupLabel(props.mode, props.identifier())}
                        marketReferencePrice={marketReferencePrice()}
                        onCopyValue={(field, value) => void copyValue(field, value)}
                        onOpenTrade={openTradeModal}
                        onSetPriceMode={setPriceMode}
                        onSetTimeRange={setTimeRange}
                        onToggleSummary={() => setShowFullSummary(open => !open)}
                        paymentTokenLabel={paymentTokenLabel()}
                        priceMode={priceMode()}
                        sellEnabled={sellEnabled()}
                        spreadText={readSpreadText(registryAsset, priceMode(), paymentTokenMeta())}
                        sourceHref={registryAsset.sources[0]}
                        statusTone={statusTone}
                        summaryPreview={summaryPreview()}
                        showFullSummary={showFullSummary()}
                        timeRange={timeRange()}
                        timeRanges={TIME_RANGES}
                      />

                      <AssetDetailSummaryGrid
                        asset={registryAsset}
                        detail={assetDetail}
                        paymentTokenMeta={paymentTokenMeta()}
                      />

                      <AssetDetailStatsSection
                        asset={registryAsset}
                        detail={assetDetail}
                        paymentTokenMeta={paymentTokenMeta()}
                        redemptionMarketReferencePrice={redemptionMarketReferencePrice()}
                        redemptionSettlementPrice={redemptionSettlementPrice()}
                        subscriptionMarketReferencePrice={subscriptionMarketReferencePrice()}
                        subscriptionSettlementPrice={subscriptionSettlementPrice()}
                      />

                      <AssetDetailReferencePanels
                        asset={registryAsset}
                        detail={assetDetail}
                        displayedRoutes={displayedRoutes}
                      />

                      <AssetDetailSourcesSection asset={registryAsset} />
                    </section>

                    <AssetTradeModal
                      asset={registryAsset}
                      detail={assetDetail}
                      mode={priceMode()}
                      onClose={() => setTradeModalOpen(false)}
                      onCompleted={applyTradeResult}
                      onModeChange={setPriceMode}
                      open={tradeModalOpen()}
                      paymentTokenMeta={paymentTokenMeta()}
                    />
                  </>
                );
              }}
            </Show>
          </Show>
        </Show>
      </section>
    </main>
  );
}
