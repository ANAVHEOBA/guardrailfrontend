import { A } from "@solidjs/router";
import { createSignal, For, onCleanup, Show } from "solid-js";

import {
  buildPreferredAssetPageHref,
  DEFAULT_PAYMENT_TOKEN_DISPLAY_META,
  formatPaymentTokenAmountFromBaseUnits,
  type AssetResponse,
} from "~/lib";
import { primePublicAssetDetailFromAsset } from "~/components/asset-detail/data";

interface PublicAssetSectionsProps {
  assets: AssetResponse[];
  title?: string;
  onRetry?: () => void;
  loading?: boolean;
  error?: string | null;
}

const EAGER_ASSET_IMAGE_COUNT = 6;

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function FilterDropdown(props: { label: string; options: string[] }) {
  const [open, setOpen] = createSignal(false);
  const [selected, setSelected] = createSignal(props.options[0] ?? props.label);
  let ref: HTMLDivElement | undefined;

  const handleOutsideClick = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  const toggle = () => {
    setOpen(v => {
      if (!v) document.addEventListener("click", handleOutsideClick);
      else document.removeEventListener("click", handleOutsideClick);
      return !v;
    });
  };

  onCleanup(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("click", handleOutsideClick);
    }
  });

  return (
    <div class="pm-filter-dropdown" ref={ref}>
      {/* <button
        type="button"
        class={`pm-filter-trigger${open() ? " pm-filter-trigger--open" : ""}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open()}
      >
        <span class="pm-filter-trigger__label">{selected()}</span>
        <span class="pm-filter-trigger__chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button> */}

      <Show when={open()}>
        <div class="pm-filter-menu" role="listbox">
          <For each={props.options}>
            {option => (
              <button
                type="button"
                role="option"
                aria-selected={selected() === option}
                class={`pm-filter-menu__item${selected() === option ? " pm-filter-menu__item--active" : ""}`}
                onClick={() => {
                  setSelected(option);
                  setOpen(false);
                  document.removeEventListener("click", handleOutsideClick);
                }}
              >
                {option}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function generateSparklinePath(seed: string): string {
  const width = 200;
  const height = 48;
  const steps = 12;
  let val = 50;
  const points: [number, number][] = [];

  for (let i = 0; i < steps; i++) {
    const code = seed.charCodeAt(i % seed.length);
    const delta = ((code % 24) - 12) * 1.8;
    val = Math.max(8, Math.min(92, val + delta));
    points.push([(i / (steps - 1)) * width, height - (val / 100) * height]);
  }

  let path = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = ((prev[0] + curr[0]) / 2).toFixed(1);
    path += ` C ${cpx} ${prev[1].toFixed(1)}, ${cpx} ${curr[1].toFixed(1)}, ${curr[0].toFixed(1)} ${curr[1].toFixed(1)}`;
  }
  return path;
}

function StatusBadge(props: { asset: AssetResponse }) {
  const label = props.asset.asset_state_label?.toLowerCase() ?? "";

  if (label.includes("active")) {
    return (
      <span class="pm-dash-card__badge pm-dash-card__badge--green" aria-label="Active">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="8" fill="#067647" />
          <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    );
  }

  if (label.includes("pend") || label.includes("paus")) {
    return (
      <span class="pm-dash-card__badge pm-dash-card__badge--orange" aria-label="Pending">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="8" fill="#b54708" />
          <path d="M10.5 5.5A3 3 0 1 1 5.8 4.2M10.5 3v2.5H8" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span class="pm-dash-card__badge pm-dash-card__badge--blue" aria-label="Available">
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill="#1652f0" />
        <path d="M8 4.5v7M4.5 8h7" stroke="#fff" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </span>
  );
}

function AssetCard(props: { asset: AssetResponse; eager?: boolean }) {
  const asset = () => props.asset;
  const fallbackLetter = () => asset().symbol.charAt(0).toUpperCase() || "A";
  const sparkline = () => generateSparklinePath(asset().asset_address);
  const price = () =>
    formatPaymentTokenAmountFromBaseUnits(
      asset().price_per_token,
      DEFAULT_PAYMENT_TOKEN_DISPLAY_META,
    );

  return (
    <A
      class="pm-dash-card-shell pm-dash-card-link"
      href={buildPreferredAssetPageHref(asset())}
      onMouseEnter={() => void primePublicAssetDetailFromAsset(asset())}
      onFocus={() => void primePublicAssetDetailFromAsset(asset())}
    >
      <article class="pm-dash-card">
        <div class="pm-dash-card__header">
          <div class="pm-dash-card__avatar">
            <Show
              when={asset().image_url}
              fallback={
                <span class="pm-dash-card__avatar-fallback">{fallbackLetter()}</span>
              }
            >
              <img
                src={asset().image_url ?? ""}
                alt={`${asset().name} icon`}
                loading={props.eager ? "eager" : "lazy"}
                decoding={props.eager ? "sync" : "async"}
                fetchpriority={props.eager ? "high" : "auto"}
              />
            </Show>
          </div>
          <div class="pm-dash-card__title-wrap">
            <h2 class="pm-dash-card__title">{asset().name}</h2>
          </div>
          <StatusBadge asset={asset()} />
        </div>

        <div class="pm-dash-card__meta-row">
          <span class="pm-dash-card__symbol">{asset().symbol}</span>
          <span class="pm-dash-card__state">{asset().asset_state_label}</span>
        </div>

        <div class="pm-dash-card__sub-row">
          <span class="pm-dash-card__sub-label">Subscription slots</span>
          <span class="pm-dash-card__sub-price">{price()}</span>
        </div>

        <div class="pm-dash-card__chart">
          <svg
            viewBox="0 0 200 48"
            preserveAspectRatio="none"
            class="pm-dash-card__sparkline"
            aria-hidden="true"
          >
            <path d={sparkline()} stroke="#1652f0" stroke-width="1.5" fill="none" />
          </svg>
        </div>

        <div class="pm-dash-card__footer">
          <span class="pm-dash-card__footer-label">
            {asset().market_segment ?? asset().asset_type_name ?? "Asset"}
          </span>
          <span class="pm-dash-card__footer-value">{asset().holder_count} holders</span>
        </div>
      </article>
    </A>
  );
}

function DashCardSkeleton() {
  return (
    <div class="pm-dash-card-shell">
      <article class="pm-dash-card pm-dash-card--skeleton" aria-hidden="true">
        <div class="pm-dash-card__header">
          <div class="pm-dash-card__avatar pm-dash-skel" />
          <div class="pm-dash-card__title-wrap">
            <div class="pm-dash-skel pm-dash-skel--title" />
          </div>
          <div class="pm-dash-skel pm-dash-skel--badge" />
        </div>
        <div class="pm-dash-card__meta-row">
          <div class="pm-dash-skel pm-dash-skel--meta" />
        </div>
        <div class="pm-dash-card__sub-row">
          <div class="pm-dash-skel pm-dash-skel--sub" />
        </div>
        <div class="pm-dash-card__chart pm-dash-skel pm-dash-skel--chart" />
        <div class="pm-dash-card__footer">
          <div class="pm-dash-skel pm-dash-skel--footer" />
        </div>
      </article>
    </div>
  );
}

export default function PublicAssetSections(props: PublicAssetSectionsProps) {
  return (
    <section class="pm-dashboard">
      <div class="pm-dashboard__head">
        <div class="pm-dashboard__head-left">
          <h1 class="pm-dashboard__title">{props.title ?? "Premium Dashboard"}</h1>
          <p class="pm-dashboard__subtitle">Browse assets from all market segments ▾</p>
        </div>
        <div class="pm-dashboard__filters">
          <FilterDropdown label="Security trend" options={["Security trend", "All trends"]} />
          <FilterDropdown label="All assets" options={["All assets", "Active", "Pending"]} />
        </div>
      </div>

      <Show
        when={!props.loading}
        fallback={
          <div class="pm-dashboard__grid">
            <For each={Array.from({ length: 12 })}>{() => <DashCardSkeleton />}</For>
          </div>
        }
      >
        <Show
          when={!props.error}
          fallback={
            <div class="pm-home__state">
              <p class="pm-home__state-title">Unable to load assets</p>
              <p class="pm-home__state-copy">{props.error}</p>
              <Show when={props.onRetry}>
                <button class="pm-button pm-button--primary" onClick={() => props.onRetry?.()}>
                  Retry
                </button>
              </Show>
            </div>
          }
        >
          <Show
            when={props.assets.length > 0}
            fallback={
              <div class="pm-home__state">
                <p class="pm-home__state-title">No assets found</p>
                <p class="pm-home__state-copy">Assets will appear here once created.</p>
              </div>
            }
          >
            <div class="pm-dashboard__grid">
              <For each={props.assets}>
                {(asset, index) => (
                  <AssetCard asset={asset} eager={index() < EAGER_ASSET_IMAGE_COUNT} />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
