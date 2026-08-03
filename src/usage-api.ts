import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { getAccountFromConfig, type Account } from "./account";
import {
  resolveAccount,
  blockToken,
  isTokenBlocked,
  markKeychainChecked,
  keychainCheckedRecently,
} from "./identity";
import {
  CACHE_FILE,
  CONFIG_DIR,
  CREDENTIALS_FILE,
  IS_DEFAULT_PROFILE,
} from "./profile";

const CACHE_TTL_MS = 300_000; // 5 minutes
const MAX_STALE_MS = 3_600_000; // 1 hour — stale data older than this is discarded
const REQUEST_TIMEOUT_MS = 3000; // statusline은 매 렌더 호출되므로 매달리면 안 된다

/**
 * 429 쿨다운 범위.
 *
 * `retry-after`를 그대로 믿으면 무너진다: 이 엔드포인트는 429를 유지한 채로
 * `retry-after: 0`을 돌려주는 것이 관측됐고(그러면 쿨다운이 0초가 된다),
 * HTTP-date 형식이면 `parseInt`가 NaN을 낸다. 어느 쪽이든 백오프가 사라져
 * 렌더마다 429를 다시 맞으러 간다. 그래서 양수일 때만 값을 따르고, 그마저도
 * 하한·상한 안으로 가둔다.
 */
const MIN_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 1_800_000;
const DEFAULT_COOLDOWN_MS = 600_000;

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
  /**
   * 이 데이터를 받아올 때 쓴 access token의 지문.
   * 다른 토큰으로 받은 값(과거 오염분 포함)을 재사용하지 않기 위한 안전장치.
   */
  tokenFp?: string;
  data: UsageResponse;
};

type CacheStore = Record<string, CacheEntry>;

type Credentials = {
  accessToken: string;
  expiresAt?: number;
};

/**
 * Claude Code가 statusline stdin에 실어 보내는 rate limit.
 *
 * 출처가 `/api/oauth/usage`가 아니라 그 세션이 방금 받은 추론 응답의
 * `anthropic-ratelimit-unified-*` 헤더다. 그래서 별도 조회가 필요 없고, 그
 * 세션이 실제로 쓰는 계정의 수치임이 보장되며, usage 엔드포인트가 429여도 나온다.
 *
 * `used_percentage`는 0~100, `resets_at`은 epoch 초 (2.1.220 기준 실측).
 */
export type RateLimits = {
  five_hour?: { used_percentage?: number; resets_at?: number | string };
  seven_day?: { used_percentage?: number; resets_at?: number | string };
};

/**
 * 계정별 캐시 키. 단일 키를 쓰면 계정 전환 후에도 이전 계정 수치가
 * TTL 동안 그대로 표시된다.
 */
function cacheKey(account: Account | null): string {
  return account ? `${LEGACY_CACHE_KEY}:${account.orgUuid}` : LEGACY_CACHE_KEY;
}

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function parseCredentials(raw: string): Credentials | null {
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth;
    const accessToken = oauth?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) return null;
    return {
      accessToken,
      expiresAt:
        typeof oauth?.expiresAt === "number" ? oauth.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

/** 이 프로필이 소유한 자격증명 파일 */
function readCredentialsFile(): Credentials | null {
  try {
    return parseCredentials(readFileSync(CREDENTIALS_FILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * macOS Keychain의 자격증명.
 *
 * "Claude Code-credentials" 아이템은 시스템에 하나뿐이라 항상 "전역 활성 계정"
 * 것이다. 그래서 기본 프로필에서만 읽고, 그림자 파일 갱신도 기본 프로필에서만
 * 한다 — 별도 프로필(CLAUDE_CONFIG_DIR)의 자격증명 파일을 이 값으로 덮어쓰면
 * 그 세션이 다음 기동에서 남의 계정으로 붙는다.
 */
function readCredentialsFromKeychain(): Credentials | null {
  if (!IS_DEFAULT_PROFILE) return null;

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

    const creds = parseCredentials(result);
    if (!creds) return null;

    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CREDENTIALS_FILE, result, { encoding: "utf8", mode: 0o600 });
    } catch {
      // best-effort
    }

    return creds;
  } catch {
    return null;
  }
}

/**
 * 이 프로필의 자격증명.
 *
 * 별도 프로필에서는 자기 .credentials.json만이 정본이다. 파일이 없다고 Keychain으로
 * 폴백하면 전역 활성 계정 토큰을 집어오게 되므로, 차라리 usage 표시를 포기한다.
 */
function getCredentials(): Credentials | null {
  const fromFile = readCredentialsFile();
  if (!IS_DEFAULT_PROFILE) return fromFile;

  const expired =
    fromFile?.expiresAt !== undefined && fromFile.expiresAt <= Date.now();
  if (!fromFile || expired) {
    return readCredentialsFromKeychain() ?? fromFile;
  }
  return fromFile;
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

/**
 * 현재 토큰으로 받은 것이 확실한 캐시만 반환.
 *
 * tokenFp가 없는 엔트리는 지문 도입 이전(또는 오염된) 값이라 신뢰하지 않는다 —
 * 한 번 더 조회하면 스스로 복구된다.
 */
function readVerifiedCache(
  key: string,
  fp: string,
  staleOk = false
): CacheEntry | null {
  const entry = readCache(key, staleOk);
  if (!entry) return null;
  return entry.tokenFp === fp ? entry : null;
}

function writeCache(
  key: string,
  data: UsageResponse,
  options?: { cooldownUntil?: number; dataTimestamp?: number; tokenFp?: string }
): void {
  const store = readStore();
  const now = Date.now();
  const entry: CacheEntry = {
    timestamp: now,
    dataTimestamp: options?.dataTimestamp ?? now,
    data,
  };
  if (options?.tokenFp) entry.tokenFp = options.tokenFp;
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

/** epoch 초(Claude Code) 와 ISO 문자열(OAuth API) 을 모두 받는다 */
function parseResetsAt(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // 초/밀리초 어느 쪽으로 오더라도 맞게 해석한다
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms);
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** statusline stdin의 rate limit을 표시용 값으로 (조회 없음) */
function parseRateLimits(limits: RateLimits) {
  const fiveHour = limits.five_hour;
  if (!fiveHour || typeof fiveHour.used_percentage !== "number") return null;

  const fiveHourResetAt = parseResetsAt(fiveHour.resets_at);
  return {
    fiveHourPct: fiveHour.used_percentage,
    fiveHourResetAt,
    fiveHourResetMs: fiveHourResetAt
      ? Math.max(0, fiveHourResetAt.getTime() - Date.now())
      : 0,
    sevenDayPct:
      typeof limits.seven_day?.used_percentage === "number"
        ? limits.seven_day.used_percentage
        : 0,
  };
}

function requestUsage(token: string): Promise<Response> {
  return fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * 세션이 실제로 쓰는 자격증명과 그 계정을 확정한다.
 *
 * 기본 프로필에서는 그림자 파일이 전환 이전 것일 수 있다. 예전에는 .claude.json과
 * mtime을 비교해 이를 감지했는데, .claude.json은 실행 중인 Claude Code가 수 초마다
 * 다시 쓰기 때문에 사실상 항상 "전환됨"으로 오판했다 (매 렌더 Keychain 호출).
 * 이제는 토큰이 말하는 org와 .claude.json이 말하는 org가 실제로 다를 때만 조회한다.
 */
async function resolveSession(): Promise<{
  creds: Credentials;
  fp: string;
  account: Account | null;
} | null> {
  let creds = getCredentials();
  if (!creds) return null;

  let fp = fingerprint(creds.accessToken);
  let account = await resolveAccount(creds.accessToken, fp);

  if (IS_DEFAULT_PROFILE && account && !keychainCheckedRecently(fp)) {
    const claimed = getAccountFromConfig();
    if (claimed && claimed.orgUuid !== account.orgUuid) {
      const fresh = readCredentialsFromKeychain();
      if (fresh && fresh.accessToken !== creds.accessToken) {
        creds = fresh;
        fp = fingerprint(fresh.accessToken);
        account = await resolveAccount(fresh.accessToken, fp);
      } else {
        // Keychain에도 새 토큰이 없다 — .claude.json 쪽이 틀린 것이니 그만 묻는다
        markKeychainChecked(fp);
      }
    }
  }

  return { creds, fp, account };
}

/**
 * 5시간 창 사용량.
 *
 * Claude Code가 stdin으로 rate limit을 실어 보내면 그것을 쓴다 — 세션이 방금 받은
 * 응답 헤더에서 온 값이라 조회가 필요 없고, usage 엔드포인트가 429여도 나오며,
 * 그 세션 계정의 수치임이 보장된다. 실어 보내지 않는 버전/시점에서만 API로 간다.
 *
 * 계정 이름표는 access token에서 확정한다 — 수치와 어긋날 수 없다.
 */
export async function fetchUsage(rateLimits?: RateLimits): Promise<{
  fiveHourPct: number;
  fiveHourResetMs: number;
  fiveHourResetAt: Date | null;
  sevenDayPct: number;
  account: Account | null;
} | null> {
  /** 계정을 확정하기 전에는 캐시를 꺼내 쓰지 않는다 (남의 수치를 보이는 것보다 낫다) */
  let resolved: { key: string; fp: string; account: Account | null } | null =
    null;

  const fromSession = rateLimits ? parseRateLimits(rateLimits) : null;
  if (fromSession) {
    // 이름표는 최선으로만 붙인다 — 못 붙여도 수치 자체는 이 세션 것이라 유효하다
    let account: Account | null = null;
    try {
      account = (await resolveSession())?.account ?? null;
    } catch {
      // 이름표 없이 표시
    }
    return { ...fromSession, account };
  }

  try {
    const session = await resolveSession();
    if (!session) return null;

    let { creds, fp, account } = session;
    let key = cacheKey(account);
    resolved = { key, fp, account };
    const withAccount = <T extends object>(v: T) => ({ ...v, account });

    const cached = readVerifiedCache(key, fp);
    if (cached) return withAccount(parseUsageResponse(cached.data));

    // 429 쿨다운 / 인증 거절 backoff 중에는 조회하지 않고 직전 수치로 버틴다
    if (isCoolingDown(key) || isTokenBlocked(fp)) {
      const stale = readVerifiedCache(key, fp, true);
      return stale ? withAccount(parseUsageResponse(stale.data)) : null;
    }

    let res = await requestUsage(creds.accessToken);

    // 그림자 파일 토큰이 폐기됐을 수 있다 — 기본 프로필이면 Keychain으로 한 번만 재시도
    if (res.status === 401 && IS_DEFAULT_PROFILE) {
      blockToken(fp); // 이 토큰은 확실히 죽었다
      const fresh = readCredentialsFromKeychain();
      if (fresh && fresh.accessToken !== creds.accessToken) {
        creds = fresh;
        fp = fingerprint(fresh.accessToken);
        account = await resolveAccount(fresh.accessToken, fp);
        key = cacheKey(account);
        resolved = { key, fp, account };
        res = await requestUsage(fresh.accessToken);
      }
    }

    if (!res.ok) {
      const stale = readVerifiedCache(key, fp, true);
      const staleData = stale?.data;
      const isStaleUsable =
        staleData && stale && Date.now() - stale.dataTimestamp < MAX_STALE_MS;

      // 인증 거절은 다음 렌더에 재시도해도 결과가 같다 — 잠시 쉰다
      if (res.status === 401 || res.status === 403) blockToken(fp);

      if (res.status === 429) {
        const seconds = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
        const cooldownMs =
          Number.isFinite(seconds) && seconds > 0
            ? Math.min(Math.max(seconds * 1000, MIN_COOLDOWN_MS), MAX_COOLDOWN_MS)
            : DEFAULT_COOLDOWN_MS;
        writeCache(key, staleData ?? {}, {
          cooldownUntil: Date.now() + cooldownMs,
          dataTimestamp: stale?.dataTimestamp ?? 0,
          tokenFp: staleData ? fp : undefined,
        });
      } else if (isStaleUsable) {
        // Other errors: refresh timestamp to avoid immediate retry
        writeCache(key, staleData!, {
          dataTimestamp: stale!.dataTimestamp,
          tokenFp: fp,
        });
      }

      return staleData?.five_hour || staleData?.seven_day
        ? withAccount(parseUsageResponse(staleData))
        : null;
    }

    const data: UsageResponse = await res.json();
    writeCache(key, data, { tokenFp: fp });

    return withAccount(parseUsageResponse(data));
  } catch {
    // 네트워크 오류/타임아웃: 계정을 확정한 경우에만 직전 수치를 재사용한다
    if (!resolved) return null;

    const stale = readVerifiedCache(resolved.key, resolved.fp, true);
    if (!stale) return null;

    if (Date.now() - stale.dataTimestamp < MAX_STALE_MS) {
      writeCache(resolved.key, stale.data, {
        dataTimestamp: stale.dataTimestamp,
        tokenFp: stale.tokenFp,
      });
    }
    return { ...parseUsageResponse(stale.data), account: resolved.account };
  }
}
