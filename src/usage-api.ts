import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_STALE_MS = 3_600_000; // 1 hour — stale data older than this is discarded
const CACHE_DIR = join(homedir(), ".claude");
const CACHE_FILE = join(CACHE_DIR, ".claude-usage-cache.json");
const CACHE_KEY = "claude_usage";

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
 * Get Claude Code OAuth token from credentials file (Linux/Windows)
 */
function getTokenFromCredentialsFile(): string | null {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const content = readFileSync(credPath, "utf8");
    const creds = JSON.parse(content);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Get Claude Code OAuth token from macOS Keychain
 */
function getTokenFromKeychain(): string | null {
  try {
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const creds = JSON.parse(result);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Get Claude Code OAuth token (credentials file → macOS Keychain fallback)
 */
function getToken(): string | null {
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
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(store), "utf8");
  } catch {
    // Ignore write errors
  }
}

function readCache(staleOk = false): CacheEntry | null {
  const store = readStore();
  const entry = store[CACHE_KEY];
  if (!entry) return null;
  // Backward compat: old entries without dataTimestamp fall back to timestamp
  if (!entry.dataTimestamp) entry.dataTimestamp = entry.timestamp;
  if (!staleOk && Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry;
}

function writeCache(
  data: UsageResponse,
  options?: { cooldownUntil?: number; dataTimestamp?: number }
): void {
  const store = readStore();
  const now = Date.now();
  store[CACHE_KEY] = {
    timestamp: now,
    dataTimestamp: options?.dataTimestamp ?? now,
    data,
  };
  if (options?.cooldownUntil) store[CACHE_KEY].cooldownUntil = options.cooldownUntil;
  writeStore(store);
}

function isCoolingDown(): boolean {
  const store = readStore();
  const entry = store[CACHE_KEY];
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

/**
 * Fetch usage data from Anthropic API (with file-based cache)
 */
export async function fetchUsage(): Promise<{
  fiveHourPct: number;
  fiveHourResetMs: number;
  fiveHourResetAt: Date | null;
  sevenDayPct: number;
} | null> {
  try {
    // Check cache first (includes cooldown check)
    const cached = readCache();
    if (cached) return parseUsageResponse(cached.data);

    // During cooldown, skip API call and use stale cache
    if (isCoolingDown()) {
      const stale = readCache(true);
      return stale ? parseUsageResponse(stale.data) : null;
    }

    const token = getToken();
    if (!token) return null;

    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!res.ok) {
      const stale = readCache(true);
      const staleData = stale?.data;
      const isStaleUsable =
        staleData && stale && Date.now() - stale.dataTimestamp < MAX_STALE_MS;

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const cooldownMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 600_000; // default 10 minutes
        writeCache(staleData ?? {}, {
          cooldownUntil: Date.now() + cooldownMs,
          dataTimestamp: stale?.dataTimestamp ?? 0,
        });
      } else if (isStaleUsable) {
        // Other errors: refresh timestamp to avoid immediate retry
        writeCache(staleData!, { dataTimestamp: stale!.dataTimestamp });
      }

      return staleData?.five_hour || staleData?.seven_day
        ? parseUsageResponse(staleData)
        : null;
    }

    const data: UsageResponse = await res.json();
    writeCache(data);

    return parseUsageResponse(data);
  } catch {
    // Network error: re-save stale data only if it's fresh enough
    const stale = readCache(true);
    if (stale) {
      if (Date.now() - stale.dataTimestamp < MAX_STALE_MS) {
        writeCache(stale.data, { dataTimestamp: stale.dataTimestamp });
      }
      return parseUsageResponse(stale.data);
    }
    return null;
  }
}
