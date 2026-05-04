const ASSET_TOKEN_DECIMALS = 18;

export interface ParsedAssetTokenAmountInput {
  baseUnits: string;
  displayAmount: string;
}

export function parseAssetTokenAmountInput(raw: string): ParsedAssetTokenAmountInput {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new Error("Amount is required.");
  }

  const normalized = trimmed.startsWith(".") ? `0${trimmed}` : trimmed;

  if (!/^\d+(?:\.\d{0,18})?$/.test(normalized)) {
    throw new Error("Amount must be a valid asset value with up to 18 decimals.");
  }

  const [wholeRaw, fractionalRaw = ""] = normalized.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const fractional = fractionalRaw.padEnd(ASSET_TOKEN_DECIMALS, "0");
  const baseUnits = `${whole}${fractional}`.replace(/^0+/, "") || "0";

  if (baseUnits === "0") {
    throw new Error("Amount must be greater than zero.");
  }

  const trimmedFractional = fractional.replace(/0+$/, "");

  return {
    baseUnits,
    displayAmount: trimmedFractional ? `${whole}.${trimmedFractional}` : whole,
  };
}

export function formatAssetTokenBaseUnits(raw: string | null | undefined): string {
  if (!raw) {
    return "Not available";
  }

  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) {
    return raw;
  }

  const normalized = trimmed.replace(/^0+/, "") || "0";

  if (normalized.length <= ASSET_TOKEN_DECIMALS) {
    const fractional = normalized
      .padStart(ASSET_TOKEN_DECIMALS, "0")
      .replace(/0+$/, "");
    return fractional.length > 0 ? `0.${fractional}` : "0";
  }

  const splitIndex = normalized.length - ASSET_TOKEN_DECIMALS;
  const whole = normalized.slice(0, splitIndex).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fractional = normalized.slice(splitIndex).replace(/0+$/, "");

  return fractional.length > 0 ? `${whole}.${fractional}` : whole;
}

export function normalizeAssetTokenAmount(value: string): string | null {
  try {
    return parseAssetTokenAmountInput(value).baseUnits;
  } catch {
    return null;
  }
}
