#!/usr/bin/env node

// src/render.ts
var BAR_LENGTH = 10;
var ANSI = {
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[31m",
  dim: "\x1B[90m",
  reset: "\x1B[0m"
};
function getColor(percentage) {
  if (percentage <= 50)
    return ANSI.green;
  if (percentage <= 80)
    return ANSI.yellow;
  return ANSI.red;
}
function renderBar(percentage) {
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const filledCount = Math.round(clampedPct / 100 * BAR_LENGTH);
  const emptyCount = BAR_LENGTH - filledCount;
  const color = getColor(clampedPct);
  const filled = `${color}${"█".repeat(filledCount)}${ANSI.reset}`;
  const empty = `${ANSI.dim}${"░".repeat(emptyCount)}${ANSI.reset}`;
  return filled + empty;
}
function formatDuration(ms) {
  if (ms <= 0)
    return "0m";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// src/usage-api.ts
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { homedir } from "os";
function getTokenFromCredentialsFile() {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json");
    const content = readFileSync(credPath, "utf8");
    const creds = JSON.parse(content);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
function getTokenFromKeychain() {
  try {
    const result = execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const creds = JSON.parse(result);
    return creds?.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}
function getToken() {
  return getTokenFromCredentialsFile() ?? getTokenFromKeychain();
}
async function fetchUsage() {
  try {
    const token = getToken();
    if (!token)
      return null;
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20"
      }
    });
    if (!res.ok)
      return null;
    const data = await res.json();
    const fiveHourPct = data.five_hour?.utilization ?? 0;
    const sevenDayPct = data.seven_day?.utilization ?? 0;
    let fiveHourResetMs = 0;
    let fiveHourResetAt = null;
    if (data.five_hour?.resets_at) {
      fiveHourResetAt = new Date(data.five_hour.resets_at);
      fiveHourResetMs = Math.max(0, fiveHourResetAt.getTime() - Date.now());
    }
    return {
      fiveHourPct,
      fiveHourResetMs,
      fiveHourResetAt,
      sevenDayPct
    };
  } catch {
    return null;
  }
}

// src/setup.ts
import { readFileSync as readFileSync2, writeFileSync, mkdirSync, existsSync } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";
import { createInterface } from "readline";
var SETTINGS_PATH = join2(homedir2(), ".claude", "settings.json");
var STATUSLINE_COMMAND = "usage-statusbar";
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
function readSettings() {
  try {
    return JSON.parse(readFileSync2(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeSettings(settings) {
  const dir = join2(homedir2(), ".claude");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + `
`);
}
async function setup() {
  console.log(`
✔ usage-statusbar 설치 완료!`);
  if (!process.stdin.isTTY) {
    console.log(`
설정 적용:
  usage-statusbar --setup
`);
    return;
  }
  const settings = readSettings();
  if (settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log(`✅ statusLine이 이미 설정되어 있습니다.
`);
    return;
  }
  const answer = await ask("? ~/.claude/settings.json에 statusLine 설정을 추가할까요? (Y/n) ");
  if (answer.toLowerCase() === "n") {
    console.log(`
수동 설정:`);
    console.log(`  settings.json에 추가: "statusLine": { "type": "command", "command": "${STATUSLINE_COMMAND}" }
`);
    return;
  }
  settings.statusLine = {
    type: "command",
    command: STATUSLINE_COMMAND,
    padding: 0
  };
  writeSettings(settings);
  console.log(`✅ 설정 완료! 다음 Claude Code 세션부터 적용됩니다.
`);
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
  } catch {}
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
    console.log(`\uD83E\uDDE0 ${contextBar} ${Math.round(contextPct)}% | ⏰ ${blockBar} ${Math.round(usage.fiveHourPct)}% | \uD83D\uDD04 ${resetKST} (-${resetTime})`);
  } else {
    console.log(`\uD83E\uDDE0 ${contextBar} ${Math.round(contextPct)}%`);
  }
}
async function main() {
  if (process.argv.includes("--setup")) {
    await setup();
  } else {
    await statusline();
  }
}
main().catch(() => {
  console.log("\uD83E\uDDE0 ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ --%");
});
