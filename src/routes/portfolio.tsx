import { A, type RouteDefinition } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import PortfolioAssetRequestsSection from "~/components/portfolio/PortfolioAssetRequestsSection.tsx";
import {
  primePortfolioPageBundle,
  primeStoredPortfolioPageBundle,
  readCachedPortfolioPageBundle,
  type PortfolioPageBundle,
} from "~/components/portfolio/data.ts";
import PublicPageLayout from "~/components/public-browser/PublicPageLayout.tsx";
import PublicState from "~/components/public-browser/PublicState.tsx";
import {
  AUTH_SESSION_CHANGE_EVENT,
  readStoredAuthSession,
  type StoredAuthSession,
} from "~/lib/auth/session.ts";

type PortfolioPageStatus = "loading" | "ready" | "error" | "unauthenticated";

export const route = {
  preload: () => primeStoredPortfolioPageBundle(),
} satisfies RouteDefinition;

function formatUsdAmount(value: string): string {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

function formatWalletAddress(value: string): string {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatExecutedAt(value: string): string {
  const parsedValue = Date.parse(value);

  if (Number.isNaN(parsedValue)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsedValue));
}

function buildEventHref(eventSlug: string | null | undefined): string | null {
  const normalizedEventSlug = eventSlug?.trim();

  if (!normalizedEventSlug) {
    return null;
  }

  return `/event/${encodeURIComponent(normalizedEventSlug)}`;
}

function readMarketLabel(
  label: string | null | undefined,
  question: string | null | undefined,
): string {
  return label?.trim() || question?.trim() || "Unknown market";
}

function readEventTitle(title: string | null | undefined, marketLabel: string): string {
  return title?.trim() || marketLabel;
}

function readUppercaseLabel(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue.toUpperCase() : fallback;
}

function readOutcomeLabel(value: string | null | undefined): string {
  return value?.trim() || "Unknown outcome";
}

function readAssetSymbol(value: string | null | undefined): string {
  return value?.trim() || "ASSET";
}

function openAuthModal() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("guardrail:open-auth-modal"));
}

export default function PortfolioRoute() {
  const [session, setSession] = createSignal<StoredAuthSession | null>(null);
  const [didReadSession, setDidReadSession] = createSignal(false);
  const [portfolioBundle, setPortfolioBundle] = createSignal<PortfolioPageBundle | null>(null);
  const [status, setStatus] = createSignal<PortfolioPageStatus>("loading");
  const [error, setError] = createSignal<string | null>(null);
  let portfolioRequestVersion = 0;

  onMount(() => {
    setSession(readStoredAuthSession());
    setDidReadSession(true);

    const handleSessionChange = (event: Event) => {
      const nextSession = (event as CustomEvent<StoredAuthSession | null>).detail;
      setSession(nextSession ?? readStoredAuthSession());
      setDidReadSession(true);
    };

    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);

    onCleanup(() => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    });
  });

  createEffect(() => {
    if (!didReadSession()) {
      setStatus("loading");
      return;
    }

    const activeSession = session();
    const token = activeSession?.token?.trim() ?? "";
    const userId = activeSession?.user?.id?.trim() ?? "";

    if (token.length === 0 || userId.length === 0) {
      setPortfolioBundle(null);
      setError(null);
      setStatus("unauthenticated");
      return;
    }

    const requestId = ++portfolioRequestVersion;
    const cachedBundle = readCachedPortfolioPageBundle(userId);

    if (cachedBundle) {
      setPortfolioBundle(cachedBundle);
      setStatus("ready");
    } else {
      setPortfolioBundle(null);
      setStatus("loading");
    }

    setError(null);

    primePortfolioPageBundle(token, userId)
      .then(bundle => {
        if (requestId !== portfolioRequestVersion) {
          return;
        }

        setPortfolioBundle(bundle);
        setStatus("ready");
      })
      .catch(caughtError => {
        if (requestId !== portfolioRequestVersion) {
          return;
        }

        const message =
          caughtError instanceof Error ? caughtError.message : "Unable to load your portfolio.";

        if (cachedBundle) {
          setError(message);
          return;
        }

        setPortfolioBundle(null);
        setError(message);
        setStatus("error");
      });
  });

  const portfolio = createMemo(() => portfolioBundle()?.portfolio ?? null);
  const initialAssetRequests = createMemo(
    () => portfolioBundle()?.assetRequests.asset_requests ?? [],
  );
  const initialAssetTypes = createMemo(() => portfolioBundle()?.assetTypes.asset_types ?? []);

  const summaryCards = createMemo(() => {
    const data = portfolio();

    if (!data) {
      return [];
    }

    return [
      {
        label: "Portfolio balance",
        value: formatUsdAmount(data.summary.portfolio_balance),
      },
      {
        label: "Cash balance",
        value: formatUsdAmount(data.summary.cash_balance),
      },
      {
        label: "Total balance",
        value: formatUsdAmount(data.summary.total_balance),
      },
      {
        label: "Total bought",
        value: formatUsdAmount(data.summary.total_buy_amount),
      },
      {
        label: "Total sold",
        value: formatUsdAmount(data.summary.total_sell_amount),
      },
    ];
  });

  const visibleMarkets = createMemo(() => portfolio()?.markets.slice(0, 8) ?? []);
  const visibleHistory = createMemo(() => portfolio()?.history.slice(0, 8) ?? []);
  const visibleAssetHistory = createMemo(() => portfolio()?.asset_history?.slice(0, 8) ?? []);

  const retryLoad = () => {
    const activeSession = readStoredAuthSession();
    setSession(activeSession ? { ...activeSession } : null);
  };

  return (
    <PublicPageLayout
      title="Portfolio | GuardRail"
      kicker="Account"
      heading="Portfolio"
      summary="Track your balances, trade history, and private asset-request workflow from one authenticated account page."
      actions={
        <Show when={portfolio()}>
          {data => (
            <div class="pm-browser__button-row">
              <span class="pm-browser__pill">{data().account_kind.replace(/_/g, " ")}</span>
              <span class="pm-browser__pill">{formatWalletAddress(data().wallet_address)}</span>
            </div>
          )}
        </Show>
      }
    >
      <Show when={status() === "loading"}>
        <PublicState title="Loading portfolio" copy="Fetching your authenticated portfolio data." />
      </Show>

      <Show when={status() === "unauthenticated"}>
        <PublicState
          title="Sign in to view your portfolio"
          copy="Your portfolio page requires an authenticated session before it can load account data."
          actionLabel="Open sign in"
          onAction={openAuthModal}
        />
      </Show>

      <Show when={status() === "error"}>
        <PublicState
          title="Unable to load portfolio"
          copy={error() ?? "The portfolio endpoints could not be loaded."}
          actionLabel="Try again"
          onAction={retryLoad}
        />
      </Show>

      <Show when={status() === "ready" && portfolio()}>
        {() => (
          <>
            <section class="pm-home__section">
              <div class="pm-browser__summary-grid">
                <For each={summaryCards()}>
                  {card => (
                    <article class="pm-browser__summary-card">
                      <p class="pm-browser__summary-kicker">{card.label}</p>
                      <h2 class="pm-browser__summary-title">{card.value}</h2>
                    </article>
                  )}
                </For>
              </div>
            </section>

            <PortfolioAssetRequestsSection
              token={session()?.token ?? ""}
              initialAssetRequests={initialAssetRequests()}
              initialAssetTypes={initialAssetTypes()}
            />

            <section class="pm-home__section">
              <div class="pm-detail__grid">
                <article class="pm-detail__card">
                  <h2 class="pm-detail__card-title">Markets</h2>
                  <p class="pm-detail__card-copy">
                    Highest-value market rows from your current portfolio snapshot.
                  </p>

                  <Show
                    when={visibleMarkets().length > 0}
                    fallback={<p class="pm-detail__card-copy">No market positions yet.</p>}
                  >
                    <div class="pm-detail__list">
                      <For each={visibleMarkets()}>
                        {market => {
                          const marketLabel = readMarketLabel(
                            market.market?.label,
                            market.market?.question,
                          );
                          const href = buildEventHref(market.event?.slug);

                          return (
                            <Show
                              when={href}
                              fallback={
                                <div class="pm-detail__list-link">
                                  <span>{marketLabel}</span>
                                  <span>{formatUsdAmount(market.portfolio_balance)}</span>
                                </div>
                              }
                            >
                              {safeHref => (
                                <A class="pm-detail__list-link" href={safeHref()}>
                                  <span>{marketLabel}</span>
                                  <span>{formatUsdAmount(market.portfolio_balance)}</span>
                                </A>
                              )}
                            </Show>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </article>

                <article class="pm-detail__card">
                  <h2 class="pm-detail__card-title">Recent Activity</h2>
                  <p class="pm-detail__card-copy">
                    Latest trade history items returned by your account portfolio endpoint.
                  </p>

                  <Show
                    when={visibleHistory().length > 0}
                    fallback={<p class="pm-detail__card-copy">No trade history yet.</p>}
                  >
                    <div class="pm-detail__timeline">
                      <For each={visibleHistory()}>
                        {trade => {
                          const marketLabel = readMarketLabel(
                            trade.market?.label,
                            trade.market?.question,
                          );
                          const eventTitle = readEventTitle(trade.event?.title, marketLabel);
                          const actionLabel = readUppercaseLabel(trade.action, "TRADE");
                          const outcomeLabel = readOutcomeLabel(trade.outcome_label);

                          return (
                            <div class="pm-detail__timeline-item">
                              <span class="pm-detail__timeline-dot" aria-hidden="true" />
                              <div class="pm-detail__timeline-copy">
                                <p class="pm-detail__timeline-title">
                                  {actionLabel} {outcomeLabel} in {marketLabel}
                                </p>
                                <p class="pm-detail__timeline-meta">
                                  {formatUsdAmount(trade.usdc_amount)} • {trade.token_amount} shares
                                </p>
                                <p class="pm-detail__timeline-detail">
                                  {eventTitle} • {formatExecutedAt(trade.executed_at)}
                                </p>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </article>

                <article class="pm-detail__card">
                  <h2 class="pm-detail__card-title">Asset Trade History</h2>
                  <p class="pm-detail__card-copy">
                    Latest asset purchase and redemption history from your account portfolio endpoint.
                  </p>

                  <Show
                    when={visibleAssetHistory().length > 0}
                    fallback={<p class="pm-detail__card-copy">No asset trades yet.</p>}
                  >
                    <div class="pm-detail__timeline">
                      <For each={visibleAssetHistory()}>
                        {trade => {
                          const tradeTypeLabel = readUppercaseLabel(trade.trade_type, "TRADE");
                          const assetSymbol = readAssetSymbol(trade.asset_symbol);

                          return (
                            <div class="pm-detail__timeline-item">
                              <span class="pm-detail__timeline-dot" aria-hidden="true" />
                              <div class="pm-detail__timeline-copy">
                                <p class="pm-detail__timeline-title">
                                  {tradeTypeLabel} {assetSymbol}
                                </p>
                                <p class="pm-detail__timeline-meta">
                                  {formatUsdAmount(trade.payment_amount)} • {trade.token_amount} tokens
                                </p>
                                <p class="pm-detail__timeline-detail">
                                  {trade.asset_name} • {formatExecutedAt(trade.executed_at)}
                                </p>
                                <Show when={trade.tx_hash}>
                                  <p
                                    class="pm-detail__timeline-detail"
                                    style="font-family: monospace; font-size: 0.75rem;"
                                  >
                                    {trade.tx_hash?.slice(0, 10)}...{trade.tx_hash?.slice(-8)}
                                  </p>
                                </Show>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </article>
              </div>
            </section>
          </>
        )}
      </Show>
    </PublicPageLayout>
  );
}
