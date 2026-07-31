import { readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
import { getAccount, type Account } from "./account";

const CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_STALE_MS = 3_600_000; // 1 hour — stale data older than this is discarded
/** cswap run 같은 세션 모드에서는 프로필 디렉터리가 다르므로 env를 존중해야 한다 */
const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const CACHE_FILE = join(CONFIG_DIR, ".claude-usage-cache.json");
const CREDENTIALS_FILE = join(CONFIG_DIR, ".credentials.json");
const CLAUDE_JSON = join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), ".claude.json");

/**
 * 계정을 모르던 시절의 키. ai-usage-monitor가 이 키를 읽으므로
 * 활성 계정 데이터를 여기에도 미러링해 하위 호환을 유지한다.
 */
const LEGACY_CACHE_KEY = "claude_usage";

/** Keychain 조회가 걸리면 statusline 전체가 멈추므로 상한을 둔다 */
const KEYCHAIN_TIMEOUT_MS = 2000;

type UsageResponse = {
  five_hour?: {
    utilization: number;
    resets_at: string;
  };
  seven_day?: {
    utilization: number;
    resets_at: string;
  };
};

type CacheEntry = {
  timestamp: number;
  dataTimestamp: number;
  cooldownUntil?: number;
  data: UsageResponse;
};

type CacheStore = Record<string, CacheEntry>;

/**
 * 계정별 캐시 키. 단일 키를 쓰면 계정 전환 후에도 이전 계정 수치가
 * TTL 동안 그대로 표시된다.
 */
function cacheKey(account: Account | null): string {
  return account ? `${LEGACY_CACHE_KEY}:${account.orgUuid}` : LEGACY_CACHE_KEY;
}

/**
 * Get Claude Code OAuth token from credentials file (Linux/Windows)
 */
function getTokenFromCredentialsFile(): string | null {
  try {
    const creds = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf8"));
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Get Claude Code OAuth token from macOS Keychain.
 * 읽은 값은 파일로도 복사해 다음 조회부터는 Keychain을 건드리지 않게 한다.
 */
function getTokenFromKeychain(): string | null {
  try {
    // 셸을 거치지 않도록 execFile 사용 (인자 배열 전달)
    const result = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: KEYCHAIN_TIMEOUT_MS,
      }
    ).trim();
    const creds = JSON.parse(result);
    const token = creds?.claudeAiOauth?.accessToken ?? null;

    if (token) {
      try {
        mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
          encoding: "utf8",
          mode: 0o600,
        });
      } catch {
        // best-effort
      }
    }

    return token;
  } catch {
    return null;
  }
}

function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * .credentials.json이 현재 계정 것인지 판정한다.
 *
 * macOS에서 자격증명 정본은 Keychain이고 .credentials.json은 그림자 사본이다.
 * 전환 도구가 이 그림자를 함께 갱신해주는지는 도구와 버전에 따라 다르므로
 * (claude-swap은 최신 버전에서 이미 존재하는 파일만 갱신한다) 신선도를 가정하지
 * 않는다. 대신 계정 전환 시 갱신되는 .claude.json과 mtime을 비교해, 설정이 더
 * 새것이면 그림자를 이전 계정 것으로 본다.
 */
function credentialsFileLooksStale(): boolean {
  const cred = mtimeMs(CREDENTIALS_FILE);
  if (cred === null) return true;

  const config = mtimeMs(CLAUDE_JSON);
  if (config === null) return false;

  return config > cred;
}

/**
 * Get Claude Code OAuth token.
 *
 * Keychain이 정본이지만 조회할 때마다 접근 승인 다이얼로그가 뜰 수 있어서,
 * 전환이 의심될 때만 조회한다. Keychain을 읽으면 파일도 갱신되므로
 * 실질적으로 "전환당 1회"로 수렴한다.
 */
function getToken(forceKeychain = false): string | null {
  if (process.platform !== "darwin") {
    return getTokenFromCredentialsFile() ?? getTokenFromKeychain();
  }

  if (forceKeychain || credentialsFileLooksStale()) {
    return getTokenFromKeychain() ?? getTokenFromCredentialsFile();
  }

  return getTokenFromCredentialsFile() ?? getTokenFromKeychain();
}

function readStore(): CacheStore {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(store), "utf8");
  } catch {
    // Ignore write errors
  }
}

function readCache(key: string, staleOk = false): CacheEntry | null {
  const store = readStore();
  const entry = store[key];
  if (!entry) return null;
  // Backward compat: old entries without dataTimestamp fall back to timestamp
  if (!entry.dataTimestamp) entry.dataTimestamp = entry.timestamp;
  if (!staleOk && Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry;
}

function writeCache(
  key: string,
  data: UsageResponse,
  options?: { cooldownUntil?: number; dataTimestamp?: number }
): void {
  const store = readStore();
  const now = Date.now();
  const entry: CacheEntry = {
    timestamp: now,
    dataTimestamp: options?.dataTimestamp ?? now,
    data,
  };
  if (options?.cooldownUntil) entry.cooldownUntil = options.cooldownUntil;

  store[key] = entry;
  // 활성 계정 데이터를 레거시 키에도 미러링 (ai-usage-monitor 호환)
  if (key !== LEGACY_CACHE_KEY) store[LEGACY_CACHE_KEY] = entry;

  writeStore(store);
}

function isCoolingDown(key: string): boolean {
  const store = readStore();
  const entry = store[key];
  return !!entry?.cooldownUntil && Date.now() < entry.cooldownUntil;
}

function parseUsageResponse(data: UsageResponse) {
  const fiveHourPct = data.five_hour?.utilization ?? 0;
  const sevenDayPct = data.seven_day?.utilization ?? 0;

  let fiveHourResetMs = 0;
  let fiveHourResetAt: Date | null = null;
  if (data.five_hour?.resets_at) {
    fiveHourResetAt = new Date(data.five_hour.resets_at);
    fiveHourResetMs = Math.max(0, fiveHourResetAt.getTime() - Date.now());
  }

  return { fiveHourPct, fiveHourResetMs, fiveHourResetAt, sevenDayPct };
}

function requestUsage(token: string): Promise<Response> {
  return fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
}

/**
 * Fetch usage data from Anthropic API (with per-account file cache)
 */
export async function fetchUsage(): Promise<{
  fiveHourPct: number;
  fiveHourResetMs: number;
  fiveHourResetAt: Date | null;
  sevenDayPct: number;
  account: Account | null;
} | null> {
  const account = getAccount();
  const key = cacheKey(account);
  const withAccount = <T extends object>(v: T) => ({ ...v, account });

  try {
    // Check cache first (includes cooldown check)
    const cached = readCache(key);
    if (cached) return withAccount(parseUsageResponse(cached.data));

    // During cooldown, skip API call and use stale cache
    if (isCoolingDown(key)) {
      const stale = readCache(key, true);
      return stale ? withAccount(parseUsageResponse(stale.data)) : null;
    }

    let token = getToken();
    if (!token) return null;

    let res = await requestUsage(token);

    // 파일의 토큰이 만료됐을 수 있다 — Keychain으로 한 번만 재시도
    if (res.status === 401) {
      const fresh = getToken(true);
      if (fresh && fresh !== token) {
        token = fresh;
        res = await requestUsage(token);
      }
    }

    if (!res.ok) {
      const stale = readCache(key, true);
      const staleData = stale?.data;
      const isStaleUsable =
        staleData && stale && Date.now() - stale.dataTimestamp < MAX_STALE_MS;

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const cooldownMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 600_000; // default 10 minutes
        writeCache(key, staleData ?? {}, {
          cooldownUntil: Date.now() + cooldownMs,
          dataTimestamp: stale?.dataTimestamp ?? 0,
        });
      } else if (isStaleUsable) {
        // Other errors: refresh timestamp to avoid immediate retry
        writeCache(key, staleData!, { dataTimestamp: stale!.dataTimestamp });
      }

      return staleData?.five_hour || staleData?.seven_day
        ? withAccount(parseUsageResponse(staleData))
        : null;
    }

    const data: UsageResponse = await res.json();
    writeCache(key, data);

    return withAccount(parseUsageResponse(data));
  } catch {
    // Network error: re-save stale data only if it's fresh enough
    const stale = readCache(key, true);
    if (stale) {
      if (Date.now() - stale.dataTimestamp < MAX_STALE_MS) {
        writeCache(key, stale.data, { dataTimestamp: stale.dataTimestamp });
      }
      return withAccount(parseUsageResponse(stale.data));
    }
    return null;
  }
}
