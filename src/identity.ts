import { join } from "path";
import { CONFIG_DIR } from "./profile";
import { toAccount, getAccountFromConfig, type Account } from "./account";
import { readJsonStore, writeJsonStore } from "./kv-store";
import { oauthFetch } from "./oauth";

/**
 * access token → 계정 확정.
 *
 * 표시되는 수치는 전적으로 토큰이 결정하는데, 계정 이름표는 .claude.json에서
 * 따로 읽어왔다. 두 소스가 어긋나면 (프로필 자격증명이 다른 계정 것이거나 전환
 * 도중이면) "A 계정 이름표 + B 계정 쿼터"가 표시된다 — 실제로 이 사고가 났다.
 *
 * /api/oauth/profile은 토큰이 속한 org를 그대로 알려주므로 이걸 정본으로 쓴다.
 * 토큰당 org는 변하지 않으니 지문으로 캐시해서 새 토큰이 나타날 때만 조회한다.
 */

const IDENTITY_FILE = join(CONFIG_DIR, ".claude-identity-cache.json");

/**
 * 인증이 거절된 토큰을 다시 시도하기까지의 간격.
 *
 * statusline은 렌더마다 실행되므로, 죽은 토큰을 그때마다 재시도하면 API를 계속
 * 두드리게 된다 (기존에는 429에만 쿨다운이 있어 401은 무한 반복이었다).
 */
const AUTH_BACKOFF_MS = 600_000; // 10 minutes

/**
 * Keychain 재확인 간격.
 *
 * .claude.json이 계속 다른 계정을 주장하는데 Keychain에도 새 토큰이 없는 상태가
 * 있을 수 있다 (예: 이전 계정으로 떠 있는 세션이 .claude.json을 되돌려 쓰는 경우).
 * 이때 매 렌더 `security`를 부르지 않도록 확인 간격에 하한을 둔다.
 */
const KEYCHAIN_RECHECK_MS = 60_000;

/**
 * 로컬 자격증명 파일이 없거나 만료됐을 때 Keychain을 확인하는 간격.
 * tokenFp로 구분되지 않는 상황(파일 자체가 없거나 만료됨)이라 고정 키를 쓴다.
 */
const NO_CREDENTIALS_KEY = "__no_credentials__";

/** 성공하면 org를, 인증이 거절되면 재시도 시각을 기록한다 */
type TokenState = {
  orgUuid?: string;
  orgName?: string;
  blockedUntil?: number;
  /** 이 토큰 기준으로 Keychain을 확인해봤자 소용없다고 판명된 시각까지 */
  keychainCheckedUntil?: number;
};
/** tokenFp → state (NO_CREDENTIALS_KEY도 같은 스토어를 공유) */
type TokenStore = Record<string, TokenState>;

function readStore(): TokenStore {
  return readJsonStore<TokenState>(IDENTITY_FILE);
}

function writeStore(store: TokenStore): void {
  writeJsonStore(CONFIG_DIR, IDENTITY_FILE, store, 0o600);
}

/** 지문은 토큰 수명만큼만 유효하므로 무한정 쌓이지 않게 최근 것만 남긴다 */
function putState(fp: string, patch: TokenState): void {
  const store = readStore();
  const entries = Object.entries(store)
    .filter(([key]) => key !== fp)
    .slice(-15);
  writeStore({
    ...Object.fromEntries(entries),
    [fp]: { ...store[fp], ...patch },
  });
}

/** 이 토큰으로는 당분간 조회하지 않는다 */
export function blockToken(tokenFp: string): void {
  putState(tokenFp, { blockedUntil: Date.now() + AUTH_BACKOFF_MS });
}

export function isTokenBlocked(tokenFp: string): boolean {
  const state = readStore()[tokenFp];
  return !!state?.blockedUntil && Date.now() < state.blockedUntil;
}

/** Keychain을 확인했지만 이 토큰과 같은 값이었다 — 당분간 다시 묻지 않는다 */
export function markKeychainChecked(tokenFp: string): void {
  putState(tokenFp, { keychainCheckedUntil: Date.now() + KEYCHAIN_RECHECK_MS });
}

export function keychainCheckedRecently(tokenFp: string): boolean {
  const state = readStore()[tokenFp];
  return (
    !!state?.keychainCheckedUntil && Date.now() < state.keychainCheckedUntil
  );
}

/**
 * 로컬 자격증명 파일이 없거나 만료된 상태에서 Keychain을 확인했다.
 * 세션이 idle해서 파일이 계속 만료 상태로 남아 있어도 렌더마다 다시 묻지 않는다.
 */
export function markNoCredentialsKeychainChecked(): void {
  putState(NO_CREDENTIALS_KEY, { keychainCheckedUntil: Date.now() + KEYCHAIN_RECHECK_MS });
}

export function noCredentialsKeychainCheckedRecently(): boolean {
  return keychainCheckedRecently(NO_CREDENTIALS_KEY);
}

/** null = 확정 실패, "unauthorized" = 토큰이 거절됨 */
async function fetchIdentity(
  token: string
): Promise<TokenState | "unauthorized" | null> {
  try {
    const res = await oauthFetch("https://api.anthropic.com/api/oauth/profile", token);
    if (res.status === 401 || res.status === 403) return "unauthorized";
    if (!res.ok) return null;

    const data: any = await res.json();
    const orgUuid = data?.organization?.uuid;
    if (typeof orgUuid !== "string" || !orgUuid) return null;

    return { orgUuid, orgName: data?.organization?.name ?? "unknown" };
  } catch {
    // 네트워크 오류/타임아웃은 토큰 문제가 아니므로 backoff를 걸지 않는다
    return null;
  }
}

/**
 * 토큰이 속한 계정. 확정하지 못하면 .claude.json 폴백.
 *
 * @param tokenFp 토큰 지문 (캐시 키)
 */
export async function resolveAccount(
  token: string,
  tokenFp: string
): Promise<Account | null> {
  const state = readStore()[tokenFp];
  if (state?.orgUuid) return toAccount(state.orgUuid, state.orgName ?? "unknown");
  if (isTokenBlocked(tokenFp)) return getAccountFromConfig();

  const identity = await fetchIdentity(token);

  if (identity === "unauthorized") {
    blockToken(tokenFp);
    return getAccountFromConfig();
  }
  if (identity?.orgUuid) {
    putState(tokenFp, identity);
    return toAccount(identity.orgUuid, identity.orgName ?? "unknown");
  }

  return getAccountFromConfig();
}
