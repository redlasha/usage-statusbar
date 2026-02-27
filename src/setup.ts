import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createInterface } from "readline";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const STATUSLINE_COMMAND = "usage-statusbar";

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function readSettings(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, any>): void {
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

export async function setup(): Promise<void> {
  console.log("\n✔ usage-statusbar 설치 완료!");

  // non-interactive 환경에서는 안내만
  if (!process.stdin.isTTY) {
    console.log(`\n설정 적용:\n  usage-statusbar --setup\n`);
    return;
  }

  const settings = readSettings();

  // 이미 설정되어 있는 경우
  if (settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log("✅ statusLine이 이미 설정되어 있습니다.\n");
    return;
  }

  const answer = await ask("? ~/.claude/settings.json에 statusLine 설정을 추가할까요? (Y/n) ");

  if (answer.toLowerCase() === "n") {
    console.log("\n수동 설정:");
    console.log(`  settings.json에 추가: "statusLine": { "type": "command", "command": "${STATUSLINE_COMMAND}" }\n`);
    return;
  }

  settings.statusLine = {
    type: "command",
    command: STATUSLINE_COMMAND,
    padding: 0,
  };

  writeSettings(settings);
  console.log("✅ 설정 완료! 다음 Claude Code 세션부터 적용됩니다.\n");
}
