import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_STALE_MS = 3_600_000; // 1 hour — stale data older than this is discarded
const CACHE_DIR = join(homedir(), ".claude");
const CACHE_FILE = join(CACHE_DIR, ".usage-statusbar-cache.json");

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

type CachedData = {
  timestamp: number;
  dataTimestamp: number; // when the data was actually fetched from API
  cooldownUntil?: number;
  response: UsageResponse;
};

function readCache(staleOk = false): CachedData | null {
  try {
    const content = readFileSync(CACHE_FILE, "utf8");
    const cached: CachedData = JSON.parse(content);
    // Backward compat: old cache files without dataTimestamp fall back to timestamp
    if (!cached.dataTimestamp) cached.dataTimestamp = cached.timestamp;
    if (!staleOk && Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(
  response: UsageResponse,
  options?: { cooldownUntil?: number; dataTimestamp?: number }
): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const now = Date.now();
    const cached: CachedData = {
      timestamp: now,
      dataTimestamp: options?.dataTimestamp ?? now,
      response,
    };
    if (options?.cooldownUntil) cached.cooldownUntil = options.cooldownUntil;
    writeFileSync(CACHE_FILE, JSON.stringify(cached), "utf8");
  } catch {
    // Ignore write errors
  }
}

function isCoolingDown(): boolean {
  try {
    const content = readFileSync(CACHE_FILE, "utf8");
    const cached: CachedData = JSON.parse(content);
    return !!cached.cooldownUntil && Date.now() < cached.cooldownUntil;
  } catch {
    return false;
  }
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
    if (cached) return parseUsageResponse(cached.response);

    // During cooldown, skip API call and use stale cache
    if (isCoolingDown()) {
      const stale = readCache(true);
      return stale ? parseUsageResponse(stale.response) : null;
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
      const staleResponse = stale?.response;
      const isStaleUsable =
        staleResponse &&
        stale &&
        Date.now() - stale.dataTimestamp < MAX_STALE_MS;

      if (isStaleUsable) {
        if (res.status === 429) {
          const retryAfter = res.headers.get("retry-after");
          const cooldownMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : 600_000; // default 10 minutes
          writeCache(staleResponse, {
            cooldownUntil: Date.now() + cooldownMs,
            dataTimestamp: stale.dataTimestamp,
          });
        } else {
          // Other errors: refresh timestamp to avoid immediate retry
          writeCache(staleResponse, { dataTimestamp: stale.dataTimestamp });
        }
      }
      // If stale data is too old (>MAX_STALE_MS), don't re-save it.
      // Next call will retry the API without stale cache interference.

      return staleResponse?.five_hour || staleResponse?.seven_day
        ? parseUsageResponse(staleResponse)
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
        writeCache(stale.response, { dataTimestamp: stale.dataTimestamp });
      }
      return parseUsageResponse(stale.response);
    }
    return null;
  }
}
