#!/usr/bin/env node

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
var CACHE_DIR = (0, import_path.join)((0, import_os.homedir)(), ".claude");
var CACHE_FILE = (0, import_path.join)(CACHE_DIR, ".usage-statusbar-cache.json");
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
function readCache(staleOk = false) {
  try {
    const content = (0, import_fs.readFileSync)(CACHE_FILE, "utf8");
    const cached = JSON.parse(content);
    if (!staleOk && Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}
function writeCache(response, cooldownUntil) {
  try {
    (0, import_fs.mkdirSync)(CACHE_DIR, { recursive: true });
    const cached = { timestamp: Date.now(), response };
    if (cooldownUntil) cached.cooldownUntil = cooldownUntil;
    (0, import_fs.writeFileSync)(CACHE_FILE, JSON.stringify(cached), "utf8");
  } catch {
  }
}
function isCoolingDown() {
  try {
    const content = (0, import_fs.readFileSync)(CACHE_FILE, "utf8");
    const cached = JSON.parse(content);
    return !!cached.cooldownUntil && Date.now() < cached.cooldownUntil;
  } catch {
    return false;
  }
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
    if (cached) return parseUsageResponse(cached.response);
    if (isCoolingDown()) {
      const stale = readCache(true);
      return stale ? parseUsageResponse(stale.response) : null;
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
      const staleResponse = stale?.response ?? {};
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const cooldownMs = retryAfter ? parseInt(retryAfter, 10) * 1e3 : 6e5;
        writeCache(staleResponse, Date.now() + cooldownMs);
      } else {
        writeCache(staleResponse);
      }
      return staleResponse.five_hour || staleResponse.seven_day ? parseUsageResponse(staleResponse) : null;
    }
    const data = await res.json();
    writeCache(data);
    return parseUsageResponse(data);
  } catch {
    const stale = readCache(true);
    if (stale) {
      writeCache(stale.response);
      return parseUsageResponse(stale.response);
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
  const usage = await fetchUsage();
  if (usage) {
    const blockBar = renderBar(usage.fiveHourPct);
    const resetTime = formatDuration(usage.fiveHourResetMs);
    let resetKST = "";
    if (usage.fiveHourResetAt) {
      resetKST = usage.fiveHourResetAt.toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    }
    console.log(
      `\u{1F9E0} ${contextBar}${Math.round(contextPct)}% \u23F0 ${blockBar}${Math.round(usage.fiveHourPct)}% \u{1F504} ${resetKST}(-${resetTime})`
    );
  } else {
    console.log(`\u{1F9E0} ${contextBar}${Math.round(contextPct)}%`);
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
