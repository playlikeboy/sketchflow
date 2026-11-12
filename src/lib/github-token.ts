export const GITHUB_TOKEN_CHANGED_EVENT = "sketchflow:github-token-changed";

export const GITHUB_TOKEN_SETUP_URL =
  "https://github.com/settings/tokens/new?description=Sketchflow%20local%20sync%20token&scopes=repo,read:user,user:email";

// Where a user reviews or withdraws the access they granted Sketchflow at sign-in.
export const GITHUB_ACCESS_SETTINGS_URL = "https://github.com/settings/applications";

function canUseTokenStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getActiveUserId() {
  if (!canUseTokenStorage()) return null;
  return window.localStorage.getItem("sketchflow:active-user-id") || null;
}

function getTokenStorageKey(userId = getActiveUserId()) {
  return userId ? "sketchflow:" + userId + ":github-token" : "sketchflow:github-token";
}

function migrateLegacyTokenToSession(userId = getActiveUserId()) {
  if (!canUseTokenStorage()) return null;

  const key = getTokenStorageKey(userId);
  const current = window.sessionStorage.getItem(key)?.trim();
  if (current) return current;

  const legacy = window.localStorage.getItem(key)?.trim();
  if (!legacy) return null;

  window.sessionStorage.setItem(key, legacy);
  window.localStorage.removeItem(key);
  return legacy;
}

export function getStoredGithubToken() {
  if (!canUseTokenStorage()) return null;
  const key = getTokenStorageKey();
  return window.sessionStorage.getItem(key)?.trim() || migrateLegacyTokenToSession();
}

function emitGithubTokenChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GITHUB_TOKEN_CHANGED_EVENT));
}

export function getStoredGithubTokenFingerprint() {
  const token = getStoredGithubToken();
  if (!token) return "none";
  return token.length + ":" + token.slice(0, 4) + ":" + token.slice(-4);
}

export function setStoredGithubToken(token: string) {
  if (!canUseTokenStorage()) return;
  const nextToken = token.trim();
  const key = getTokenStorageKey();
  if (nextToken) {
    window.sessionStorage.setItem(key, nextToken);
    window.localStorage.removeItem(key);
  } else {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  }
  emitGithubTokenChange();
}

export function clearStoredGithubToken() {
  if (!canUseTokenStorage()) return;
  const key = getTokenStorageKey();
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
  window.localStorage.removeItem("sketchflow:github-token");
  emitGithubTokenChange();
}

export function hasStoredGithubToken() {
  return Boolean(getStoredGithubToken());
}
