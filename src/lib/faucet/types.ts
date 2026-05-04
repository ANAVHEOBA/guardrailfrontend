export interface FaucetClientOptions {
  baseUrl?: string;
}

export interface FaucetUsdcLegacyRequest {
  address?: string;
  amount?: string;
}

export type FaucetUsdcRequest = string | FaucetUsdcLegacyRequest;

export interface FaucetUsdcResponse {
  token_address: string;
  recipient: string;
  wallet_account_kind: string;
  amount: string;
  balance: string;
  tx_hash: string;
  requested_at: string;
  next_available_at: string;
  cooldown_seconds: number;
}

export interface FaucetUsdcBalanceResponse {
  token_address: string;
  address: string;
  balance: string;
  queried_at: string;
}
