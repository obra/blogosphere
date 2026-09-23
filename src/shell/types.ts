// ABOUTME: Contract for the platform shell — keychain, share inbox, asset files,
// ABOUTME: platform detection. Implemented over Tauri; faked in tests and web dev.

export type Platform = "macos" | "ios" | "android" | "web";

export type SymbolWeight = "regular" | "medium" | "semibold";

/** An OS-rendered SF Symbol: a PNG data URL plus its size in points. */
export interface SymbolImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** A share-sheet payload captured by the OS extension / intent. */
export interface SharePayload {
  id: string;
  url: string | null;
  title: string | null;
  text: string | null;
  receivedAt: number;
}

export interface ShellApi {
  platform(): Platform;

  // Secret storage (OS keychain). Used only for the GitHub token.
  keychainGet(key: string): Promise<string | null>;
  keychainSet(key: string, value: string): Promise<void>;
  keychainDelete(key: string): Promise<void>;

  // Share inbox (App Group dir on iOS, intent queue on Android; empty on desktop).
  shareInboxList(): Promise<SharePayload[]>;
  /** Ack (delete) only after the payload is durably in the store. */
  shareInboxAck(id: string): Promise<void>;

  // Local asset cache (app-data dir). Repo-relative keys, opaque local paths back.
  assetWrite(repoPath: string, bytes: Uint8Array): Promise<string>; // -> localPath
  assetRead(localPath: string): Promise<Uint8Array>;
  /** Local path if cached, else null. */
  assetPathFor(repoPath: string): Promise<string | null>;

  /** URL usable inside the webview <img src> for a cached asset. */
  assetDisplayUrl(localPath: string): string;

  /** Best-effort clipboard URL read (for the desktop "+ Link" prefill). */
  clipboardReadUrl(): Promise<string | null>;

  /** An SF Symbol rendered by the OS (Apple platforms only). Resolves null
   *  when unavailable — callers fall back to their own icon. Never rejects. */
  renderSymbol(
    name: string,
    pointSize: number,
    weight: SymbolWeight,
    scale: number,
  ): Promise<SymbolImage | null>;
}
