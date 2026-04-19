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
function formatDuration(ms) {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 6e4);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// src/usage-api.ts
var import_fs = require("fs");
var import_child_process = require("child_process");
var import_path = require("path");
var import_os = require("os");
var CACHE_TTL_MS = 3e5;
var MAX_STALE_MS = 36e5;
var CACHE_DIR = (0, import_path.join)((0, import_os.homedir)(), ".claude");
var CACHE_FILE = (0, import_path.join)(CACHE_DIR, ".claude-usage-cache.json");
var CACHE_KEY = "claude_usage";
function getTokenFromCredentialsFile() {
  try {
    const credPath = (0, import_path.join)((0, import_os.homedir)(), ".claude", ".credentials.json");
    const content = (0, import_fs.readFileSync)(credPath, "utf8");
    const creds = JSON.parse(content);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
function getTokenFromKeychain() {
  try {
    const result = (0, import_child_process.execSync)(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const creds = JSON.parse(result);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
function getToken() {
  return getTokenFromCredentialsFile() ?? getTokenFromKeychain();
}
function readStore() {
  try {
    return JSON.parse((0, import_fs.readFileSync)(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeStore(store) {
  try {
    (0, import_fs.mkdirSync)(CACHE_DIR, { recursive: true });
    (0, import_fs.writeFileSync)(CACHE_FILE, JSON.stringify(store), "utf8");
  } catch {
  }
}
function readCache(staleOk = false) {
  const store = readStore();
  const entry = store[CACHE_KEY];
  if (!entry) return null;
  if (!entry.dataTimestamp) entry.dataTimestamp = entry.timestamp;
  if (!staleOk && Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry;
}
function writeCache(data, options) {
  const store = readStore();
  const now = Date.now();
  store[CACHE_KEY] = {
    timestamp: now,
    dataTimestamp: options?.dataTimestamp ?? now,
    data
  };
  if (options?.cooldownUntil) store[CACHE_KEY].cooldownUntil = options.cooldownUntil;
  writeStore(store);
}
function isCoolingDown() {
  const store = readStore();
  const entry = store[CACHE_KEY];
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
async function fetchUsage() {
  try {
    const cached = readCache();
    if (cached) return parseUsageResponse(cached.data);
    if (isCoolingDown()) {
      const stale = readCache(true);
      return stale ? parseUsageResponse(stale.data) : null;
    }
    const token = getToken();
    if (!token) return null;
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20"
      }
    });
    if (!res.ok) {
      const stale = readCache(true);
      const staleData = stale?.data;
      const isStaleUsable = staleData && stale && Date.now() - stale.dataTimestamp < MAX_STALE_MS;
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const cooldownMs = retryAfter ? parseInt(retryAfter, 10) * 1e3 : 6e5;
        writeCache(staleData ?? {}, {
          cooldownUntil: Date.now() + cooldownMs,
          dataTimestamp: stale?.dataTimestamp ?? 0
        });
      } else if (isStaleUsable) {
        writeCache(staleData, { dataTimestamp: stale.dataTimestamp });
      }
      return staleData?.five_hour || staleData?.seven_day ? parseUsageResponse(staleData) : null;
    }
    const data = await res.json();
    writeCache(data);
    return parseUsageResponse(data);
  } catch {
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

// src/setup.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_os2 = require("os");
var SETTINGS_PATH = (0, import_path2.join)((0, import_os2.homedir)(), ".claude", "settings.json");
var STATUSLINE_COMMAND = "usage-statusbar";
function readSettings() {
  try {
    return JSON.parse((0, import_fs2.readFileSync)(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeSettings(settings) {
  const dir = (0, import_path2.join)((0, import_os2.homedir)(), ".claude");
  if (!(0, import_fs2.existsSync)(dir)) {
    (0, import_fs2.mkdirSync)(dir, { recursive: true });
  }
  (0, import_fs2.writeFileSync)(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
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
    hour12: true
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${dayPeriod}${hour}`;
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
  const usage = await fetchUsage();
  if (usage) {
    const blockBar = renderBar(usage.fiveHourPct);
    const resetTime = formatDuration(usage.fiveHourResetMs);
    const resetKST = usage.fiveHourResetAt ? formatHourKST(usage.fiveHourResetAt) : "";
    console.log(
      `${wtPrefix}\u{1F9E0} ${contextBar}${Math.round(contextPct)}% \u23F0 ${blockBar}${Math.round(usage.fiveHourPct)}% \u{1F504} ${resetKST}(-${resetTime})`
    );
  } else {
    console.log(`${wtPrefix}\u{1F9E0} ${contextBar}${Math.round(contextPct)}%`);
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
