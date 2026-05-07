import { A } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js";

import { getErrorMessage } from "~/lib/api.ts";
import {
  assetRequestClient,
  type AssetRequestResponse,
  type AssetRequestStatus,
  type CreateAssetRequestRequest,
} from "~/lib/asset-request/index.ts";
import { type AssetTypeResponse } from "~/lib/asset/index.ts";
import {
  cacheAssetRequestDetail,
  primeAssetRequestDetail,
  readCachedAssetRequestDetail,
} from "./data.ts";

type AssetRequestAsyncStatus = "idle" | "loading" | "ready" | "error";
type AssetRequestSubmissionStatus = "idle" | "submitting" | "success" | "error";
type AssetRequestFilter = AssetRequestStatus | "all";

interface PortfolioAssetRequestsSectionProps {
  initialAssetRequests: AssetRequestResponse[];
  initialAssetTypes: AssetTypeResponse[];
  token: string;
}

interface AssetRequestFormState {
  issuer_name: string;
  contact_name: string;
  contact_email: string;
  issuer_website: string;
  issuer_country: string;
  asset_name: string;
  asset_type_id: string;
  description: string;
  target_raise: string;
  currency: string;
  maturity_date: string;
  expected_yield_bps: string;
  redemption_summary: string;
  valuation_source: string;
  document_urls: string;
  token_symbol: string;
  max_supply: string;
  subscription_price: string;
  redemption_price: string;
  metadata_hash: string;
  slug: string;
  image_url: string;
  market_segment: string;
  suggested_internal_tags: string;
  source_urls: string;
  self_service_purchase_enabled: boolean;
}

interface FieldProps {
  children: JSX.Element;
  hint?: string;
  label: string;
  required?: boolean;
  wide?: boolean;
}

const REQUEST_LIMIT = 20;

const requestStatusOptions: Array<{ label: string; value: AssetRequestFilter }> = [
  { label: "All statuses", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "Under review", value: "under_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Deployed", value: "deployed" },
];

function createInitialFormState(assetTypeId = ""): AssetRequestFormState {
  return {
    issuer_name: "",
    contact_name: "",
    contact_email: "",
    issuer_website: "",
    issuer_country: "",
    asset_name: "",
    asset_type_id: assetTypeId,
    description: "",
    target_raise: "",
    currency: "USD",
    maturity_date: "",
    expected_yield_bps: "",
    redemption_summary: "",
    valuation_source: "",
    document_urls: "",
    token_symbol: "",
    max_supply: "",
    subscription_price: "",
    redemption_price: "",
    metadata_hash: "",
    slug: "",
    image_url: "",
    market_segment: "",
    suggested_internal_tags: "",
    source_urls: "",
    self_service_purchase_enabled: true,
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

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

function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  const parsedValue = Date.parse(value);

  if (Number.isNaN(parsedValue)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsedValue));
}

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function formatAssetTypeLabel(request: AssetRequestResponse): string {
  return request.asset_type_id_text?.trim() || request.asset_type_id;
}

function toOptionalString(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toOptionalInteger(value: string): number | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  const parsedValue = Number.parseInt(normalized, 10);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function splitInputList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map(item => item.trim())
        .filter(item => item.length > 0),
    ),
  );
}

function buildCreatePayload(form: AssetRequestFormState): CreateAssetRequestRequest {
  return {
    issuer_name: form.issuer_name.trim(),
    contact_name: form.contact_name.trim(),
    contact_email: form.contact_email.trim(),
    issuer_website: toOptionalString(form.issuer_website),
    issuer_country: toOptionalString(form.issuer_country),
    asset_name: form.asset_name.trim(),
    asset_type_id: form.asset_type_id.trim(),
    description: form.description.trim(),
    target_raise: toOptionalString(form.target_raise),
    currency: toOptionalString(form.currency)?.toUpperCase(),
    maturity_date: toOptionalString(form.maturity_date),
    expected_yield_bps: toOptionalInteger(form.expected_yield_bps),
    redemption_summary: toOptionalString(form.redemption_summary),
    valuation_source: toOptionalString(form.valuation_source),
    document_urls: splitInputList(form.document_urls),
    token_symbol: form.token_symbol.trim().toUpperCase(),
    max_supply: form.max_supply.trim(),
    subscription_price: form.subscription_price.trim(),
    redemption_price: form.redemption_price.trim(),
    self_service_purchase_enabled: form.self_service_purchase_enabled,
    metadata_hash: toOptionalString(form.metadata_hash),
    slug: toOptionalString(form.slug)?.toLowerCase(),
    image_url: toOptionalString(form.image_url),
    market_segment: toOptionalString(form.market_segment),
    suggested_internal_tags: splitInputList(form.suggested_internal_tags),
    source_urls: splitInputList(form.source_urls),
  };
}

function FormField(props: FieldProps) {
  return (
    <label
      class={`pm-asset-request__field${props.wide ? " pm-asset-request__field--wide" : ""}`}
    >
      <span class="pm-asset-request__label">
        {props.label}
        <Show when={props.required}>
          <span class="pm-asset-request__required"> *</span>
        </Show>
      </span>
      {props.children}
      <Show when={props.hint}>
        {hint => <span class="pm-asset-request__hint">{hint()}</span>}
      </Show>
    </label>
  );
}

function StatusPill(props: { status: string }) {
  return (
    <span class={`pm-asset-request__status-pill pm-asset-request__status-pill--${props.status}`}>
      {formatStatusLabel(props.status)}
    </span>
  );
}

export default function PortfolioAssetRequestsSection(
  props: PortfolioAssetRequestsSectionProps,
) {
  const [assetRequests, setAssetRequests] = createSignal<AssetRequestResponse[]>(
    props.initialAssetRequests,
  );
  const [requestListStatus, setRequestListStatus] =
    createSignal<AssetRequestAsyncStatus>("ready");
  const [requestListError, setRequestListError] = createSignal<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = createSignal<string | null>(
    props.initialAssetRequests[0]?.id ?? null,
  );
  const [requestDetail, setRequestDetail] = createSignal<AssetRequestResponse | null>(null);
  const [requestDetailStatus, setRequestDetailStatus] =
    createSignal<AssetRequestAsyncStatus>("idle");
  const [requestDetailError, setRequestDetailError] = createSignal<string | null>(null);
  const [listFilter, setListFilter] = createSignal<AssetRequestFilter>("all");
  const [assetTypes, setAssetTypes] = createSignal<AssetTypeResponse[]>(props.initialAssetTypes);
  const [assetTypesStatus, setAssetTypesStatus] = createSignal<AssetRequestAsyncStatus>("ready");
  const [assetTypesError, setAssetTypesError] = createSignal<string | null>(null);
  const [form, setForm] = createSignal<AssetRequestFormState>(
    createInitialFormState(props.initialAssetTypes[0]?.asset_type_id ?? ""),
  );
  const [submissionStatus, setSubmissionStatus] =
    createSignal<AssetRequestSubmissionStatus>("idle");
  const [submissionError, setSubmissionError] = createSignal<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = createSignal<string | null>(null);
  const [hasUsedInitialRequests, setHasUsedInitialRequests] = createSignal(false);

  let listRequestVersion = 0;
  let detailRequestVersion = 0;

  const selectedRequestSummary = createMemo(() => {
    const requestId = selectedRequestId();
    return assetRequests().find(request => request.id === requestId) ?? null;
  });

  const selectedRequest = createMemo(() => {
    const detail = requestDetail();

    if (detail && detail.id === selectedRequestId()) {
      return detail;
    }

    return selectedRequestSummary();
  });

  const requestStats = createMemo(() => {
    const requests = assetRequests();

    return [
      {
        label: "Total requests",
        value: String(requests.length),
      },
      {
        label: "In review",
        value: String(
          requests.filter(
            request => request.status === "submitted" || request.status === "under_review",
          ).length,
        ),
      },
      {
        label: "Approved",
        value: String(requests.filter(request => request.status === "approved").length),
      },
      {
        label: "Deployed",
        value: String(requests.filter(request => request.status === "deployed").length),
      },
    ];
  });

  const updateFormField = (field: keyof AssetRequestFormState, value: string | boolean) => {
    setForm(current => ({
      ...current,
      [field]: value,
    }) as AssetRequestFormState);
    setSubmissionStatus("idle");
    setSubmissionError(null);
    setSubmissionSuccess(null);
  };

  createEffect(() => {
    const initialRequests = props.initialAssetRequests;

    if (listFilter() !== "all") {
      return;
    }

    for (const request of initialRequests) {
      cacheAssetRequestDetail(request);
    }

    setAssetRequests(initialRequests);
    setRequestListStatus("ready");
    setSelectedRequestId(currentSelectedId => {
      if (initialRequests.some(request => request.id === currentSelectedId)) {
        return currentSelectedId;
      }

      return initialRequests[0]?.id ?? null;
    });
  });

  createEffect(() => {
    const initialAssetTypes = props.initialAssetTypes;

    setAssetTypes(initialAssetTypes);
    setAssetTypesStatus("ready");
    setAssetTypesError(null);

    if (initialAssetTypes[0]?.asset_type_id && form().asset_type_id.trim().length === 0) {
      setForm(currentForm => ({
        ...currentForm,
        asset_type_id: initialAssetTypes[0].asset_type_id,
      }));
    }
  });

  const refreshRequestList = () => {
    const token = props.token.trim();
    const activeFilter = listFilter();

    if (token.length === 0) {
      setAssetRequests([]);
      setSelectedRequestId(null);
      setRequestDetail(null);
      setRequestListStatus("idle");
      setRequestListError(null);
      return;
    }

    const requestId = ++listRequestVersion;
    setRequestListStatus("loading");
    setRequestListError(null);

    assetRequestClient
      .listMyAssetRequests(token, {
        status: activeFilter === "all" ? null : activeFilter,
        limit: REQUEST_LIMIT,
        offset: 0,
      })
      .then(response => {
        if (requestId !== listRequestVersion) {
          return;
        }

        for (const request of response.asset_requests) {
          cacheAssetRequestDetail(request);
        }

        setAssetRequests(response.asset_requests);
        setRequestListStatus("ready");
        setSelectedRequestId(currentSelectedId => {
          if (response.asset_requests.some(request => request.id === currentSelectedId)) {
            return currentSelectedId;
          }

          return response.asset_requests[0]?.id ?? null;
        });
      })
      .catch(caughtError => {
        if (requestId !== listRequestVersion) {
          return;
        }

        setAssetRequests([]);
        setSelectedRequestId(null);
        setRequestDetail(null);
        setRequestListError(getErrorMessage(caughtError, "Unable to load your asset requests."));
        setRequestListStatus("error");
      });
  };

  createEffect(() => {
    const activeFilter = listFilter();

    if (!hasUsedInitialRequests()) {
      setHasUsedInitialRequests(true);

      if (activeFilter === "all") {
        return;
      }
    }

    refreshRequestList();
  });

  createEffect(() => {
    const token = props.token.trim();
    const requestId = selectedRequestId();
    const summary = selectedRequestSummary();

    if (token.length === 0 || !requestId) {
      setRequestDetail(null);
      setRequestDetailStatus("idle");
      setRequestDetailError(null);
      return;
    }

    const cachedDetail = readCachedAssetRequestDetail(requestId) ?? summary;

    if (cachedDetail) {
      setRequestDetail(cachedDetail);
      setRequestDetailStatus("ready");
      setRequestDetailError(null);
      cacheAssetRequestDetail(cachedDetail);

      if (summary && summary.id === requestId) {
        return;
      }
    }

    const detailVersion = ++detailRequestVersion;
    setRequestDetail(currentDetail => (currentDetail?.id === requestId ? currentDetail : null));
    setRequestDetailStatus("loading");
    setRequestDetailError(null);

    primeAssetRequestDetail(token, requestId)
      .then(response => {
        if (detailVersion !== detailRequestVersion) {
          return;
        }

        setRequestDetail(response);
        setRequestDetailStatus("ready");
        setAssetRequests(currentRequests =>
          currentRequests.map(currentRequest =>
            currentRequest.id === response.id ? response : currentRequest,
          ),
        );
      })
      .catch(caughtError => {
        if (detailVersion !== detailRequestVersion) {
          return;
        }

        setRequestDetailError(getErrorMessage(caughtError, "Unable to load request details."));
        setRequestDetailStatus("error");
      });
  });

  const handleSubmit: JSX.EventHandlerUnion<HTMLFormElement, SubmitEvent> = event => {
    event.preventDefault();

    const token = props.token.trim();

    if (token.length === 0) {
      setSubmissionStatus("error");
      setSubmissionError("Sign in again before submitting a new asset request.");
      return;
    }

    const payload = buildCreatePayload(form());
    setSubmissionStatus("submitting");
    setSubmissionError(null);
    setSubmissionSuccess(null);

    assetRequestClient
      .createAssetRequest(token, payload)
      .then(response => {
        const activeFilter = listFilter();
        const defaultAssetTypeId = form().asset_type_id.trim() || assetTypes()[0]?.asset_type_id || "";

        setSubmissionStatus("success");
        setSubmissionSuccess("Request submitted and added to your review queue.");
        setRequestDetail(response);
        setRequestDetailStatus("ready");
        setRequestDetailError(null);
        setSelectedRequestId(response.id);
        cacheAssetRequestDetail(response);

        if (activeFilter === "all" || activeFilter === response.status) {
          setAssetRequests(currentRequests => [
            response,
            ...currentRequests.filter(currentRequest => currentRequest.id !== response.id),
          ]);
        } else {
          setListFilter("all");
        }

        setForm(createInitialFormState(defaultAssetTypeId));
      })
      .catch(caughtError => {
        setSubmissionStatus("error");
        setSubmissionError(getErrorMessage(caughtError, "Unable to submit your asset request."));
      });
  };

  return (
    <section class="pm-home__section">
      <div class="pm-home__section-head">
        <div>
          <p class="pm-home__section-kicker">Issuance</p>
          <h2 class="pm-home__section-title">Request Queue</h2>
        </div>
      </div>

      <div class="pm-detail__grid">
        <article class="pm-detail__card pm-detail__card--wide">
          <div class="pm-asset-request__toolbar">
            <div>
              <h3 class="pm-detail__card-title">My Issuance Requests</h3>
              <p class="pm-detail__card-copy">
                Track every submission, review note, approval, and deployment update from the same
                account workspace as your portfolio.
              </p>
            </div>

            <div class="pm-asset-request__toolbar-actions">
              <label class="pm-asset-request__toolbar-filter">
                <span class="pm-asset-request__toolbar-label">Status</span>
                <select
                  class="pm-asset-request__control pm-asset-request__control--compact"
                  value={listFilter()}
                  onChange={event =>
                    setListFilter(event.currentTarget.value as AssetRequestFilter)
                  }
                >
                  <For each={requestStatusOptions}>
                    {option => <option value={option.value}>{option.label}</option>}
                  </For>
                </select>
              </label>

              <button
                class="pm-button pm-button--ghost"
                type="button"
                onClick={refreshRequestList}
                disabled={requestListStatus() === "loading"}
              >
                {requestListStatus() === "loading" ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <Show when={requestListError()}>
            {message => <p class="pm-asset-request__feedback pm-asset-request__feedback--error">{message()}</p>}
          </Show>

          <div class="pm-asset-request__summary-grid">
            <For each={requestStats()}>
              {stat => (
                <article class="pm-asset-request__summary-card">
                  <p class="pm-asset-request__detail-label">{stat.label}</p>
                  <p class="pm-asset-request__summary-value">{stat.value}</p>
                </article>
              )}
            </For>
          </div>

          <div class="pm-asset-request__split">
            <div class="pm-asset-request__list-shell">
              <Show
                when={assetRequests().length > 0}
                fallback={
                  <Show
                    when={requestListStatus() === "loading"}
                    fallback={
                      <div class="pm-asset-request__empty">
                        <p class="pm-detail__card-title">No requests yet</p>
                        <p class="pm-detail__card-copy">
                          Start a new submission below and it will appear here as soon as it enters
                          the review queue.
                        </p>
                      </div>
                    }
                  >
                    <div class="pm-asset-request__empty">
                      <p class="pm-detail__card-title">Loading requests</p>
                      <p class="pm-detail__card-copy">
                        Fetching your latest asset request activity.
                      </p>
                    </div>
                  </Show>
                }
              >
                <div class="pm-asset-request__list">
                  <For each={assetRequests()}>
                    {request => (
                      <button
                        class={`pm-asset-request__item${
                          selectedRequestId() === request.id ? " pm-asset-request__item--selected" : ""
                        }`}
                        type="button"
                        onClick={() => setSelectedRequestId(request.id)}
                      >
                        <div class="pm-asset-request__item-head">
                          <div>
                            <p class="pm-asset-request__item-title">{request.asset_name}</p>
                            <p class="pm-asset-request__item-meta">{request.issuer_name}</p>
                          </div>
                          <StatusPill status={request.status} />
                        </div>
                        <p class="pm-asset-request__item-meta">
                          Proposal #{request.proposal_id} • {formatDateTime(request.created_at)}
                        </p>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <div class="pm-asset-request__detail-shell">
              <Show when={selectedRequest()}>
                {request => (
                  <>
                    <div class="pm-asset-request__detail-head">
                      <div>
                        <h3 class="pm-detail__card-title">{request().asset_name}</h3>
                        <p class="pm-detail__card-copy">
                          {request().issuer_name} · submitted on{" "}
                          {formatDateTime(request().created_at)}
                        </p>
                      </div>
                      <StatusPill status={request().status} />
                    </div>

                    <Show when={requestDetailError()}>
                      {message => (
                        <p class="pm-asset-request__feedback pm-asset-request__feedback--error">
                          {message()}
                        </p>
                      )}
                    </Show>

                    <div class="pm-asset-request__detail-grid">
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Proposal ID</p>
                        <p class="pm-asset-request__detail-value">{request().proposal_id}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Asset type</p>
                        <p class="pm-asset-request__detail-value">{formatAssetTypeLabel(request())}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Token symbol</p>
                        <p class="pm-asset-request__detail-value">{request().token_symbol}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Issuer country</p>
                        <p class="pm-asset-request__detail-value">
                          {request().issuer_country ?? "Not provided"}
                        </p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Target raise</p>
                        <p class="pm-asset-request__detail-value">
                          {request().target_raise ?? "Not provided"}
                        </p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Currency</p>
                        <p class="pm-asset-request__detail-value">
                          {request().currency ?? "Not provided"}
                        </p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Max supply</p>
                        <p class="pm-asset-request__detail-value">{request().max_supply}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Maturity date</p>
                        <p class="pm-asset-request__detail-value">
                          {formatDateOnly(request().maturity_date)}
                        </p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Subscription price</p>
                        <p class="pm-asset-request__detail-value">{request().subscription_price}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Redemption price</p>
                        <p class="pm-asset-request__detail-value">{request().redemption_price}</p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Expected yield</p>
                        <p class="pm-asset-request__detail-value">
                          {request().expected_yield_bps !== null
                            ? `${request().expected_yield_bps} bps`
                            : "Not provided"}
                        </p>
                      </div>
                      <div class="pm-asset-request__detail-block">
                        <p class="pm-asset-request__detail-label">Self-service purchase</p>
                        <p class="pm-asset-request__detail-value">
                          {request().self_service_purchase_enabled ? "Enabled" : "Disabled"}
                        </p>
                      </div>
                    </div>

                    <div class="pm-asset-request__detail-copy">
                      <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                        <p class="pm-asset-request__detail-label">Description</p>
                        <p class="pm-asset-request__detail-text">{request().description}</p>
                      </div>

                      <Show when={request().redemption_summary}>
                        {summary => (
                          <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                            <p class="pm-asset-request__detail-label">Redemption summary</p>
                            <p class="pm-asset-request__detail-text">{summary()}</p>
                          </div>
                        )}
                      </Show>

                      <Show when={request().valuation_source}>
                        {valuationSource => (
                          <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                            <p class="pm-asset-request__detail-label">Valuation source</p>
                            <p class="pm-asset-request__detail-text">{valuationSource()}</p>
                          </div>
                        )}
                      </Show>

                      <Show when={request().review_notes}>
                        {notes => (
                          <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                            <p class="pm-asset-request__detail-label">Review notes</p>
                            <p class="pm-asset-request__detail-text">{notes()}</p>
                          </div>
                        )}
                      </Show>
                    </div>

                    <Show when={request().document_urls.length > 0}>
                      <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                        <p class="pm-asset-request__detail-label">Documents</p>
                        <div class="pm-browser__source-list">
                          <For each={request().document_urls}>
                            {url => (
                              <a href={url} target="_blank" rel="noreferrer">
                                {url}
                              </a>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={request().source_urls.length > 0}>
                      <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                        <p class="pm-asset-request__detail-label">Sources</p>
                        <div class="pm-browser__source-list">
                          <For each={request().source_urls}>
                            {url => (
                              <a href={url} target="_blank" rel="noreferrer">
                                {url}
                              </a>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={request().suggested_internal_tags.length > 0}>
                      <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                        <p class="pm-asset-request__detail-label">Suggested tags</p>
                        <div class="pm-browser__pill-row">
                          <For each={request().suggested_internal_tags}>
                            {tag => <span class="pm-browser__pill">{tag}</span>}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={request().deployed_asset_address}>
                      {assetAddress => (
                        <div class="pm-asset-request__detail-block pm-asset-request__detail-block--wide">
                          <p class="pm-asset-request__detail-label">Deployed asset</p>
                          <A class="pm-detail__list-link" href={`/assets/${encodeURIComponent(assetAddress())}`}>
                            <span>{assetAddress()}</span>
                            <span>Open asset</span>
                          </A>
                        </div>
                      )}
                    </Show>

                    <Show when={requestDetailStatus() === "loading"}>
                      <p class="pm-asset-request__detail-note">Refreshing request details...</p>
                    </Show>
                  </>
                )}
              </Show>

              <Show when={!selectedRequest() && requestListStatus() !== "loading"}>
                <div class="pm-asset-request__empty">
                  <p class="pm-detail__card-title">Select a request</p>
                  <p class="pm-detail__card-copy">
                    Select a submission to inspect pricing terms, issuer materials, and any review
                    updates from the operations team.
                  </p>
                </div>
              </Show>

              <Show when={!selectedRequest() && requestListStatus() === "loading"}>
                <div class="pm-asset-request__empty">
                  <p class="pm-detail__card-title">Loading requests</p>
                  <p class="pm-detail__card-copy">Fetching your latest asset request activity.</p>
                </div>
              </Show>
            </div>
          </div>
        </article>

        <article class="pm-detail__card pm-detail__card--wide">
          <div class="pm-asset-request__form-head">
            <div>
              <h3 class="pm-detail__card-title">Start a New Submission</h3>
              <p class="pm-detail__card-copy">
                Create an issuance ticket for internal review. Once submitted, it stays visible in
                this workspace for approval, rejection, or deployment follow-up.
              </p>
            </div>
          </div>

          <Show when={submissionError()}>
            {message => <p class="pm-asset-request__feedback pm-asset-request__feedback--error">{message()}</p>}
          </Show>

          <Show when={submissionSuccess()}>
            {message => (
              <p class="pm-asset-request__feedback pm-asset-request__feedback--success">
                {message()}
              </p>
            )}
          </Show>

          <Show when={assetTypesError()}>
            {message => (
              <p class="pm-asset-request__feedback pm-asset-request__feedback--error">
                {message()}
              </p>
            )}
          </Show>

          <form class="pm-asset-request__form" onSubmit={handleSubmit}>
            <FormField label="Issuer name" required>
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().issuer_name}
                onInput={event => updateFormField("issuer_name", event.currentTarget.value)}
                placeholder="Acme Infrastructure"
                required
              />
            </FormField>

            <FormField label="Asset name" required>
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().asset_name}
                onInput={event => updateFormField("asset_name", event.currentTarget.value)}
                placeholder="Acme Growth Note"
                required
              />
            </FormField>

            <FormField label="Contact name" required>
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().contact_name}
                onInput={event => updateFormField("contact_name", event.currentTarget.value)}
                placeholder="Jamie Doe"
                required
              />
            </FormField>

            <FormField label="Contact email" required>
              <input
                class="pm-asset-request__control"
                type="email"
                value={form().contact_email}
                onInput={event => updateFormField("contact_email", event.currentTarget.value)}
                placeholder="jamie@example.com"
                required
              />
            </FormField>

            <FormField label="Asset type" required>
              <Show
                when={assetTypes().length > 0}
                fallback={
                  <input
                    class="pm-asset-request__control"
                    type="text"
                    value={form().asset_type_id}
                    onInput={event => updateFormField("asset_type_id", event.currentTarget.value)}
                    placeholder="asset_type_id"
                    required
                  />
                }
              >
                <select
                  class="pm-asset-request__control"
                  value={form().asset_type_id}
                  onChange={event => updateFormField("asset_type_id", event.currentTarget.value)}
                  required
                >
                  <For each={assetTypes()}>
                    {assetType => (
                      <option value={assetType.asset_type_id}>
                        {assetType.asset_type_name}
                        {assetType.asset_type_id_text ? ` (${assetType.asset_type_id_text})` : ""}
                      </option>
                    )}
                  </For>
                </select>
              </Show>
            </FormField>

            <FormField label="Token symbol" required>
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().token_symbol}
                onInput={event => updateFormField("token_symbol", event.currentTarget.value)}
                placeholder="ACME"
                required
              />
            </FormField>

            <FormField label="Max supply" required>
              <input
                class="pm-asset-request__control"
                type="text"
                inputMode="decimal"
                value={form().max_supply}
                onInput={event => updateFormField("max_supply", event.currentTarget.value)}
                placeholder="1000000"
                required
              />
            </FormField>

            <FormField label="Target raise">
              <input
                class="pm-asset-request__control"
                type="text"
                inputMode="decimal"
                value={form().target_raise}
                onInput={event => updateFormField("target_raise", event.currentTarget.value)}
                placeholder="2500000"
              />
            </FormField>

            <FormField label="Currency">
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().currency}
                onInput={event => updateFormField("currency", event.currentTarget.value)}
                placeholder="USD"
              />
            </FormField>

            <FormField label="Subscription price" required>
              <input
                class="pm-asset-request__control"
                type="text"
                inputMode="decimal"
                value={form().subscription_price}
                onInput={event => updateFormField("subscription_price", event.currentTarget.value)}
                placeholder="1.00"
                required
              />
            </FormField>

            <FormField label="Redemption price" required>
              <input
                class="pm-asset-request__control"
                type="text"
                inputMode="decimal"
                value={form().redemption_price}
                onInput={event => updateFormField("redemption_price", event.currentTarget.value)}
                placeholder="1.02"
                required
              />
            </FormField>

            <FormField label="Maturity date">
              <input
                class="pm-asset-request__control"
                type="date"
                value={form().maturity_date}
                onInput={event => updateFormField("maturity_date", event.currentTarget.value)}
              />
            </FormField>

            <FormField label="Expected yield (bps)">
              <input
                class="pm-asset-request__control"
                type="number"
                inputMode="numeric"
                value={form().expected_yield_bps}
                onInput={event => updateFormField("expected_yield_bps", event.currentTarget.value)}
                placeholder="1250"
              />
            </FormField>

            <FormField label="Issuer website">
              <input
                class="pm-asset-request__control"
                type="url"
                value={form().issuer_website}
                onInput={event => updateFormField("issuer_website", event.currentTarget.value)}
                placeholder="https://acme.example.com"
              />
            </FormField>

            <FormField label="Issuer country">
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().issuer_country}
                onInput={event => updateFormField("issuer_country", event.currentTarget.value)}
                placeholder="US"
              />
            </FormField>

            <FormField label="Slug">
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().slug}
                onInput={event => updateFormField("slug", event.currentTarget.value)}
                placeholder="acme-growth-note"
              />
            </FormField>

            <FormField label="Image URL">
              <input
                class="pm-asset-request__control"
                type="url"
                value={form().image_url}
                onInput={event => updateFormField("image_url", event.currentTarget.value)}
                placeholder="https://example.com/acme.png"
              />
            </FormField>

            <FormField label="Market segment">
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().market_segment}
                onInput={event => updateFormField("market_segment", event.currentTarget.value)}
                placeholder="private-credit"
              />
            </FormField>

            <FormField label="Metadata hash">
              <input
                class="pm-asset-request__control"
                type="text"
                value={form().metadata_hash}
                onInput={event => updateFormField("metadata_hash", event.currentTarget.value)}
                placeholder="0x..."
              />
            </FormField>

            <FormField label="Description" required wide>
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().description}
                onInput={event => updateFormField("description", event.currentTarget.value)}
                placeholder="Summarize the issuer, the instrument structure, and why this asset should be admitted."
                required
              />
            </FormField>

            <FormField label="Redemption summary" wide>
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().redemption_summary}
                onInput={event => updateFormField("redemption_summary", event.currentTarget.value)}
                placeholder="Quarterly redemption after a 12 month lockup."
              />
            </FormField>

            <FormField label="Valuation source" wide>
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().valuation_source}
                onInput={event => updateFormField("valuation_source", event.currentTarget.value)}
                placeholder="Monthly NAV from issuer administrator."
              />
            </FormField>

            <FormField
              label="Document URLs"
              wide
              hint="Separate multiple URLs with commas or new lines."
            >
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().document_urls}
                onInput={event => updateFormField("document_urls", event.currentTarget.value)}
                placeholder="https://example.com/deck.pdf"
              />
            </FormField>

            <FormField
              label="Source URLs"
              wide
              hint="Separate multiple URLs with commas or new lines."
            >
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().source_urls}
                onInput={event => updateFormField("source_urls", event.currentTarget.value)}
                placeholder="https://example.com/source"
              />
            </FormField>

            <FormField
              label="Suggested internal tags"
              wide
              hint="Separate multiple tags with commas or new lines."
            >
              <textarea
                class="pm-asset-request__control pm-asset-request__control--textarea"
                value={form().suggested_internal_tags}
                onInput={event =>
                  updateFormField("suggested_internal_tags", event.currentTarget.value)
                }
                placeholder="yield, private-credit"
              />
            </FormField>

            <div class="pm-asset-request__form-footer">
              <label class="pm-asset-request__checkbox">
                <input
                  type="checkbox"
                  checked={form().self_service_purchase_enabled}
                  onChange={event =>
                    updateFormField(
                      "self_service_purchase_enabled",
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>Enable self-service purchase once the asset is deployed</span>
              </label>

              <button
                class="pm-button pm-button--primary"
                type="submit"
                disabled={submissionStatus() === "submitting"}
              >
                {submissionStatus() === "submitting" ? "Submitting..." : "Submit to review"}
              </button>
            </div>
          </form>

          <Show when={assetTypesStatus() === "loading"}>
            <p class="pm-asset-request__detail-note">Loading asset type choices...</p>
          </Show>
        </article>
      </div>
    </section>
  );
}
