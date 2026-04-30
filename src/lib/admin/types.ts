import type { IsoDateTimeString } from "../types.ts";
import type {
  AuthResponse,
  UserResponse,
  WalletChallengeRequest,
  WalletChallengeResponse,
  WalletConnectRequest,
} from "../auth/types.ts";

export interface AdminClientOptions {
  baseUrl?: string;
}

export type AdminWalletChallengeRequest = WalletChallengeRequest;
export type AdminWalletChallengeResponse = WalletChallengeResponse;
export type AdminWalletConnectRequest = WalletConnectRequest;
export type AdminAuthResponse = AuthResponse;

export interface AdminMeResponse {
  user: UserResponse;
  monad_chain_id: number;
}

export interface AdminImageAssetResponse {
  id: string;
  storage_provider: string;
  bucket_name: string;
  scope: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  cid: string;
  ipfs_url: string;
  gateway_url: string;
  created_at: IsoDateTimeString;
}

export interface AdminImageUploadResponse {
  asset: AdminImageAssetResponse;
}

export interface UploadAdminImageRequest {
  file: Blob;
  file_name?: string;
  scope?: string;
  folder?: string;
}
