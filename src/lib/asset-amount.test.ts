import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAssetTokenBaseUnits,
  normalizeAssetTokenAmount,
  parseAssetTokenAmountInput,
} from "./asset/index.ts";

test("parseAssetTokenAmountInput converts display asset amounts into 18-decimal base units", () => {
  assert.deepEqual(parseAssetTokenAmountInput("10"), {
    baseUnits: "10000000000000000000",
    displayAmount: "10",
  });
  assert.deepEqual(parseAssetTokenAmountInput(".5"), {
    baseUnits: "500000000000000000",
    displayAmount: "0.5",
  });
  assert.deepEqual(parseAssetTokenAmountInput("100.123456789012345678"), {
    baseUnits: "100123456789012345678",
    displayAmount: "100.123456789012345678",
  });
});

test("normalizeAssetTokenAmount returns null for invalid asset trade input", () => {
  assert.equal(normalizeAssetTokenAmount("0"), null);
  assert.equal(normalizeAssetTokenAmount("abc"), null);
  assert.equal(normalizeAssetTokenAmount("100.1234567890123456789"), null);
});

test("formatAssetTokenBaseUnits renders 18-decimal asset values for display", () => {
  assert.equal(formatAssetTokenBaseUnits("100000000000000000000"), "100");
  assert.equal(formatAssetTokenBaseUnits("350000000000"), "0.00000035");
  assert.equal(formatAssetTokenBaseUnits("13760647300849031938462386"), "13,760,647.300849031938462386");
});
