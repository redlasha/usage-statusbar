import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";

const CACHE_TTL_MS = 300_000; // 5 minutes
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
  response: UsageResponse;
};

function readCache(staleOk = false): UsageResponse | null {
  try {
    const content = readFileSync(CACHE_FILE, "utf8");
    const cached: CachedData = JSON.parse(content);
    if (!staleOk && Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.response;
  } catch {
    return null;
  }
}

function writeCache(response: UsageResponse): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const cached: CachedData = { timestamp: Date.now(), response };
    writeFileSync(CACHE_FILE, JSON.stringify(cached), "utf8");
  } catch {
    // Ignore write errors
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
 * Fetch usage data from Anthropic API (with 30s file-based cache)
 */
export async function fetchUsage(): Promise<{
  fiveHourPct: number;
  fiveHourResetMs: number;
  fiveHourResetAt: Date | null;
  sevenDayPct: number;
} | null> {
  try {
    // Check cache first
    const cached = readCache();
    if (cached) return parseUsageResponse(cached);

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
      return stale ? parseUsageResponse(stale) : null;
    }

    const data: UsageResponse = await res.json();
    writeCache(data);

    return parseUsageResponse(data);
  } catch {
    const stale = readCache(true);
    return stale ? parseUsageResponse(stale) : null;
  }
}
