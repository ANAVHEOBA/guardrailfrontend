import { For } from "solid-js";

import type { AssetDetailResponse } from "~/lib";

import { formatBooleanValue } from "./format";

interface AssetDetailReferencePanelsProps {
  detail: AssetDetailResponse | null;
}

export default function AssetDetailReferencePanels(props: AssetDetailReferencePanelsProps) {
  const rules = () => props.detail?.compliance_rules ?? null;

  return (
    <div class="pm-asset-market__lower-grid">
      <section class="pm-detail__card pm-asset-market__panel">
        <p class="pm-asset-market__panel-kicker">Availability</p>
        <h2 class="pm-detail__card-title">Public access and safeguards</h2>
        <div class="pm-asset-market__stat-rows">
          <div class="pm-asset-market__stat-row">
            <span class="pm-asset-market__stat-label">Transfers</span>
            <span class="pm-asset-market__stat-value">
              {rules() ? formatBooleanValue(rules()!.transfers_enabled) : "Not available"}
            </span>
          </div>
          <div class="pm-asset-market__stat-row">
            <span class="pm-asset-market__stat-label">Subscriptions</span>
            <span class="pm-asset-market__stat-value">
              {rules() ? formatBooleanValue(rules()!.subscriptions_enabled) : "Not available"}
            </span>
          </div>
          <div class="pm-asset-market__stat-row">
            <span class="pm-asset-market__stat-label">Redemptions</span>
            <span class="pm-asset-market__stat-value">
              {rules() ? formatBooleanValue(rules()!.redemptions_enabled) : "Not available"}
            </span>
          </div>
          <div class="pm-asset-market__stat-row">
            <span class="pm-asset-market__stat-label">Accreditation required</span>
            <span class="pm-asset-market__stat-value">
              {rules() ? formatBooleanValue(rules()!.requires_accreditation) : "Not available"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
