#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);

// src/render.ts
var BAR_LENGTH = 5;
var ANSI = {
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[31m",
  cyan: "\x1B[36m",
  magenta: "\x1B[35m",
  dim: "\x1B[90m",
  reset: "\x1B[0m"
};
function getColor(percentage) {
  if (percentage <= 50) return ANSI.green;
  if (percentage <= 80) return ANSI.yellow;
  return ANSI.red;
}
function renderBar(percentage) {
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const filledCount = Math.round(clampedPct / 100 * BAR_LENGTH);
  const emptyCount = BAR_LENGTH - filledCount;
  const color = getColor(clampedPct);
  const filled = `${color}${"\u2588".repeat(filledCount)}${ANSI.reset}`;
  const empty = `${ANSI.dim}${"\u2591".repeat(emptyCount)}${ANSI.reset}`;
  return filled + empty;
}
function renderAccount(account) {
  if (!account) return "";
  const color = account.slot === 1 ? ANSI.cyan : account.slot === 2 ? ANSI.magenta : ANSI.dim;
  const slot = account.slot !== null ? `${account.slot}\xB7` : "";
  return `${color}\u{1F464}${slot}${account.label}${ANSI.reset} `;
}
function renderModel(displayName) {
  const name = displayName.toLowerCase();
  let color = ANSI.dim;
  if (name.includes("opus")) color = ANSI.red;
  else if (name.includes("sonnet")) color = ANSI.yellow;
  else if (name.includes("fable") || name.includes("haiku")) color = ANSI.green;
  return `${color}${displayName}${ANSI.reset}`;
}
function formatDuration(ms) {
  if (ms <= 0) return "0";
  const hours = ms / 36e5;
  return hours.toFixed(1);
}

// src/usage-api.ts
var import_fs4 = require("fs");
var import_child_process = require("child_process");
var import_crypto = require("crypto");

// src/account.ts
var import_fs2 = require("fs");

// src/profile.ts
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");
var DEFAULT_CONFIG_DIR = (0, import_path.join)((0, import_os.homedir)(), ".claude");
var CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? DEFAULT_CONFIG_DIR;
function canonical(path2) {
  try {
    return (0, import_fs.realpathSync)(path2);
  } catch {
    return (0, import_path.resolve)(path2);
  }
}
var IS_DEFAULT_PROFILE = canonical(CONFIG_DIR) === canonical(DEFAULT_CONFIG_DIR);
var CLAUDE_JSON = (0, import_path.join)(
  process.env.CLAUDE_CONFIG_DIR ?? (0, import_os.homedir)(),
  ".claude.json"
);
var CREDENTIALS_FILE = (0, import_path.join)(CONFIG_DIR, ".credentials.json");
var CACHE_FILE = (0, import_path.join)(CONFIG_DIR, ".claude-usage-cache.json");
var SWAP_SEQUENCE = (0, import_path.join)(
  (0, import_os.homedir)(),
  ".claude-swap-backup",
  "sequence.json"
);

// src/account.ts
function shortLabel(orgName) {
  if (/'s Organization$/.test(orgName)) return "personal";
  return orgName.length > 12 ? `${orgName.slice(0, 12)}\u2026` : orgName;
}
function findSlot(orgUuid) {
  try {
    const seq = JSON.parse((0, import_fs2.readFileSync)(SWAP_SEQUENCE, "utf8"));
    for (const [num, acct] of Object.entries(seq?.accounts ?? {})) {
      if (acct?.organizationUuid === orgUuid) return Number(num);
    }
  } catch {
  }
  return null;
}
function toAccount(orgUuid, orgName) {
  return {
    orgUuid,
    orgName,
    slot: findSlot(orgUuid),
    label: shortLabel(orgName)
  };
}
function getAccountFromConfig() {
  try {
    const config = JSON.parse((0, import_fs2.readFileSync)(CLAUDE_JSON, "utf8"));
    const orgUuid = config?.oauthAccount?.organizationUuid;
    if (!orgUuid) return null;
    const orgName = config?.oauthAccount?.organizationName ?? "unknown";
    return toAccount(orgUuid, orgName);
  } catch {
    return null;
  }
}

// src/identity.ts
var import_fs3 = require("fs");
var import_path2 = require("path");
var IDENTITY_FILE = (0, import_path2.join)(CONFIG_DIR, ".claude-identity-cache.json");
var REQUEST_TIMEOUT_MS = 3e3;
var AUTH_BACKOFF_MS = 6e5;
var KEYCHAIN_RECHECK_MS = 6e4;
function readStore() {
  try {
    return JSON.parse((0, import_fs3.readFileSync)(IDENTITY_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeStore(store) {
  try {
    (0, import_fs3.mkdirSync)(CONFIG_DIR, { recursive: true });
    (0, import_fs3.writeFileSync)(IDENTITY_FILE, JSON.stringify(store), {
      encoding: "utf8",
      mode: 384
    });
  } catch {
  }
}
function putState(fp, patch) {
  const store = readStore();
  const entries = Object.entries(store).filter(([key]) => key !== fp).slice(-15);
  writeStore({
    ...Object.fromEntries(entries),
    [fp]: { ...store[fp], ...patch }
  });
}
function blockToken(tokenFp) {
  putState(tokenFp, { blockedUntil: Date.now() + AUTH_BACKOFF_MS });
}
function isTokenBlocked(tokenFp) {
  const state = readStore()[tokenFp];
  return !!state?.blockedUntil && Date.now() < state.blockedUntil;
}
function markKeychainChecked(tokenFp) {
  putState(tokenFp, { keychainCheckedUntil: Date.now() + KEYCHAIN_RECHECK_MS });
}
function keychainCheckedRecently(tokenFp) {
  const state = readStore()[tokenFp];
  return !!state?.keychainCheckedUntil && Date.now() < state.keychainCheckedUntil;
}
async function fetchIdentity(token) {
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/profile", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (res.status === 401 || res.status === 403) return "unauthorized";
    if (!res.ok) return null;
    const data = await res.json();
    const orgUuid = data?.organization?.uuid;
    if (typeof orgUuid !== "string" || !orgUuid) return null;
    return { orgUuid, orgName: data?.organization?.name ?? "unknown" };
  } catch {
    return null;
  }
}
async function resolveAccount(token, tokenFp) {
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

// src/usage-api.ts
var CACHE_TTL_MS = 3e5;
var MAX_STALE_MS = 36e5;
var REQUEST_TIMEOUT_MS2 = 3e3;
var MIN_COOLDOWN_MS = 3e4;
var MAX_COOLDOWN_MS = 18e5;
var DEFAULT_COOLDOWN_MS = 6e5;
var LEGACY_CACHE_KEY = "claude_usage";
var KEYCHAIN_TIMEOUT_MS = 2e3;
function cacheKey(account) {
  return account ? `${LEGACY_CACHE_KEY}:${account.orgUuid}` : LEGACY_CACHE_KEY;
}
function fingerprint(token) {
  return (0, import_crypto.createHash)("sha256").update(token).digest("hex").slice(0, 16);
}
function parseCredentials(raw) {
  try {
    const oauth = JSON.parse(raw)?.claudeAiOauth;
    const accessToken = oauth?.accessToken;
    if (typeof accessToken !== "string" || !accessToken) return null;
    return {
      accessToken,
      expiresAt: typeof oauth?.expiresAt === "number" ? oauth.expiresAt : void 0
    };
  } catch {
    return null;
  }
}
function readCredentialsFile() {
  try {
    return parseCredentials((0, import_fs4.readFileSync)(CREDENTIALS_FILE, "utf8"));
  } catch {
    return null;
  }
}
function readCredentialsFromKeychain() {
  if (!IS_DEFAULT_PROFILE) return null;
  try {
    const result = (0, import_child_process.execFileSync)(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: KEYCHAIN_TIMEOUT_MS
      }
    ).trim();
    const creds = parseCredentials(result);
    if (!creds) return null;
    try {
      (0, import_fs4.mkdirSync)(CONFIG_DIR, { recursive: true });
      (0, import_fs4.writeFileSync)(CREDENTIALS_FILE, result, { encoding: "utf8", mode: 384 });
    } catch {
    }
    return creds;
  } catch {
    return null;
  }
}
function getCredentials() {
  const fromFile = readCredentialsFile();
  if (!IS_DEFAULT_PROFILE) return fromFile;
  const expired = fromFile?.expiresAt !== void 0 && fromFile.expiresAt <= Date.now();
  if (!fromFile || expired) {
    return readCredentialsFromKeychain() ?? fromFile;
  }
  return fromFile;
}
function readStore2() {
  try {
    return JSON.parse((0, import_fs4.readFileSync)(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeStore2(store) {
  try {
    (0, import_fs4.mkdirSync)(CONFIG_DIR, { recursive: true });
    (0, import_fs4.writeFileSync)(CACHE_FILE, JSON.stringify(store), "utf8");
  } catch {
  }
}
function readCache(key, staleOk = false) {
  const store = readStore2();
  const entry = store[key];
  if (!entry) return null;
  if (!entry.dataTimestamp) entry.dataTimestamp = entry.timestamp;
  if (!staleOk && Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry;
}
function readVerifiedCache(key, fp, staleOk = false) {
  const entry = readCache(key, staleOk);
  if (!entry) return null;
  return entry.tokenFp === fp ? entry : null;
}
function writeCache(key, data, options) {
  const store = readStore2();
  const now = Date.now();
  const entry = {
    timestamp: now,
    dataTimestamp: options?.dataTimestamp ?? now,
    data
  };
  if (options?.tokenFp) entry.tokenFp = options.tokenFp;
  if (options?.cooldownUntil) entry.cooldownUntil = options.cooldownUntil;
  store[key] = entry;
  if (key !== LEGACY_CACHE_KEY) store[LEGACY_CACHE_KEY] = entry;
  writeStore2(store);
}
function isCoolingDown(key) {
  const store = readStore2();
  const entry = store[key];
  return !!entry?.cooldownUntil && Date.now() < entry.cooldownUntil;
}
function parseUsageResponse(data) {
  const fiveHourPct = data.five_hour?.utilization ?? 0;
  const sevenDayPct = data.seven_day?.utilization ?? 0;
  let fiveHourResetMs = 0;
  let fiveHourResetAt = null;
  if (data.five_hour?.resets_at) {
    fiveHourResetAt = new Date(data.five_hour.resets_at);
    fiveHourResetMs = Math.max(0, fiveHourResetAt.getTime() - Date.now());
  }
  return { fiveHourPct, fiveHourResetMs, fiveHourResetAt, sevenDayPct };
}
function parseResetsAt(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1e3;
    return new Date(ms);
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function parseRateLimits(limits) {
  const fiveHour = limits.five_hour;
  if (!fiveHour || typeof fiveHour.used_percentage !== "number") return null;
  const fiveHourResetAt = parseResetsAt(fiveHour.resets_at);
  return {
    fiveHourPct: fiveHour.used_percentage,
    fiveHourResetAt,
    fiveHourResetMs: fiveHourResetAt ? Math.max(0, fiveHourResetAt.getTime() - Date.now()) : 0,
    sevenDayPct: typeof limits.seven_day?.used_percentage === "number" ? limits.seven_day.used_percentage : 0
  };
}
function requestUsage(token) {
  return fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20"
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS2)
  });
}
async function resolveSession() {
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
        markKeychainChecked(fp);
      }
    }
  }
  return { creds, fp, account };
}
async function fetchUsage(rateLimits) {
  let resolved = null;
  const fromSession = rateLimits ? parseRateLimits(rateLimits) : null;
  if (fromSession) {
    let account = null;
    try {
      account = (await resolveSession())?.account ?? null;
    } catch {
    }
    return { ...fromSession, account };
  }
  try {
    const session = await resolveSession();
    if (!session) return null;
    let { creds, fp, account } = session;
    let key = cacheKey(account);
    resolved = { key, fp, account };
    const withAccount = (v) => ({ ...v, account });
    const cached = readVerifiedCache(key, fp);
    if (cached) return withAccount(parseUsageResponse(cached.data));
    if (isCoolingDown(key) || isTokenBlocked(fp)) {
      const stale = readVerifiedCache(key, fp, true);
      return stale ? withAccount(parseUsageResponse(stale.data)) : null;
    }
    let res = await requestUsage(creds.accessToken);
    if (res.status === 401 && IS_DEFAULT_PROFILE) {
      blockToken(fp);
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
      const isStaleUsable = staleData && stale && Date.now() - stale.dataTimestamp < MAX_STALE_MS;
      if (res.status === 401 || res.status === 403) blockToken(fp);
      if (res.status === 429) {
        const seconds = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
        const cooldownMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.max(seconds * 1e3, MIN_COOLDOWN_MS), MAX_COOLDOWN_MS) : DEFAULT_COOLDOWN_MS;
        writeCache(key, staleData ?? {}, {
          cooldownUntil: Date.now() + cooldownMs,
          dataTimestamp: stale?.dataTimestamp ?? 0,
          tokenFp: staleData ? fp : void 0
        });
      } else if (isStaleUsable) {
        writeCache(key, staleData, {
          dataTimestamp: stale.dataTimestamp,
          tokenFp: fp
        });
      }
      return staleData?.five_hour || staleData?.seven_day ? withAccount(parseUsageResponse(staleData)) : null;
    }
    const data = await res.json();
    writeCache(key, data, { tokenFp: fp });
    return withAccount(parseUsageResponse(data));
  } catch {
    if (!resolved) return null;
    const stale = readVerifiedCache(resolved.key, resolved.fp, true);
    if (!stale) return null;
    if (Date.now() - stale.dataTimestamp < MAX_STALE_MS) {
      writeCache(resolved.key, stale.data, {
        dataTimestamp: stale.dataTimestamp,
        tokenFp: stale.tokenFp
      });
    }
    return { ...parseUsageResponse(stale.data), account: resolved.account };
  }
}

// src/setup.ts
var import_fs5 = require("fs");
var import_path3 = require("path");
var import_os2 = require("os");
var SETTINGS_PATH = (0, import_path3.join)((0, import_os2.homedir)(), ".claude", "settings.json");
var STATUSLINE_COMMAND = "usage-statusbar";
function readSettings() {
  try {
    return JSON.parse((0, import_fs5.readFileSync)(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeSettings(settings) {
  const dir = (0, import_path3.join)((0, import_os2.homedir)(), ".claude");
  if (!(0, import_fs5.existsSync)(dir)) {
    (0, import_fs5.mkdirSync)(dir, { recursive: true });
  }
  (0, import_fs5.writeFileSync)(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}
function applySettings() {
  const settings = readSettings();
  if (settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log("\u2705 statusLine\uC774 \uC774\uBBF8 \uC124\uC815\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    return;
  }
  settings.statusLine = {
    type: "command",
    command: STATUSLINE_COMMAND,
    padding: 0
  };
  writeSettings(settings);
  console.log("\u2705 statusLine \uC124\uC815 \uC644\uB8CC! \uB2E4\uC74C Claude Code \uC138\uC158\uBD80\uD130 \uC801\uC6A9\uB429\uB2C8\uB2E4.");
}
async function setup() {
  console.log("\u2714 usage-statusbar \uC124\uCE58 \uC644\uB8CC!");
  applySettings();
}
async function remove() {
  const settings = readSettings();
  if (!settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log("\u2139\uFE0F statusLine \uC124\uC815\uC774 \uC874\uC7AC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    return;
  }
  delete settings.statusLine;
  writeSettings(settings);
  console.log("\u2705 statusLine \uC124\uC815\uC774 \uC81C\uAC70\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C Claude Code \uC138\uC158\uBD80\uD130 \uC801\uC6A9\uB429\uB2C8\uB2E4.");
}

// src/index.ts
function detectWorktree(cwd) {
  try {
    let dir = cwd;
    for (let i = 0; i < 20; i++) {
      const dotGit = path.join(dir, ".git");
      let stat;
      try {
        stat = fs.statSync(dotGit);
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) return { isWorktree: false };
        dir = parent;
        continue;
      }
      if (stat.isDirectory()) {
        return { isWorktree: false };
      }
      const content = fs.readFileSync(dotGit, "utf8").trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (!m) return { isWorktree: true };
      let gitdir = m[1];
      if (!path.isAbsolute(gitdir)) {
        gitdir = path.resolve(dir, gitdir);
      }
      try {
        const head = fs.readFileSync(path.join(gitdir, "HEAD"), "utf8").trim();
        const refMatch = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        const branch = refMatch ? refMatch[1] : head.slice(0, 7);
        return { isWorktree: true, branch };
      } catch {
        return { isWorktree: true };
      }
    }
  } catch {
  }
  return { isWorktree: false };
}
function formatHourKST(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${dayPeriod}${hour}:${minute}`;
}
async function statusline() {
  let input = {};
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const stdinText = Buffer.concat(chunks).toString("utf8");
    if (stdinText.trim()) {
      input = JSON.parse(stdinText);
    }
  } catch {
  }
  const contextPct = input.context_window?.used_percentage ?? 0;
  const contextBar = renderBar(contextPct);
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  const wt = detectWorktree(cwd);
  const wtPrefix = wt.isWorktree ? `\u{1F33F} ${wt.branch ?? "wt"} ` : "";
  const modelName = input.model?.display_name;
  const modelPrefix = modelName ? `${renderModel(modelName)} ` : "";
  const usage = await fetchUsage(input.rate_limits);
  if (usage) {
    const acct = renderAccount(usage.account);
    const blockBar = renderBar(usage.fiveHourPct);
    const resetTime = formatDuration(usage.fiveHourResetMs);
    const resetKST = usage.fiveHourResetAt ? formatHourKST(usage.fiveHourResetAt) : "";
    console.log(
      `${wtPrefix}${acct}${modelPrefix}\u{1F9E0} ${contextBar}${Math.round(contextPct)}% \u23F0 ${blockBar}${Math.round(usage.fiveHourPct)}% \u{1F504} ${resetKST}(-${resetTime})`
    );
  } else {
    console.log(`${wtPrefix}${modelPrefix}\u{1F9E0} ${contextBar}${Math.round(contextPct)}%`);
  }
}
async function main() {
  if (process.argv.includes("--setup")) {
    await setup();
  } else if (process.argv.includes("--remove")) {
    await remove();
  } else {
    await statusline();
  }
}
main().catch(() => {
  console.log("\u{1F9E0} \u2591\u2591\u2591\u2591\u2591--%");
});
