import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const STATUSLINE_COMMAND = "usage-statusbar";

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

function applySettings(): void {
  const settings = readSettings();

  if (settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log("✅ statusLine이 이미 설정되어 있습니다.");
    return;
  }

  settings.statusLine = {
    type: "command",
    command: STATUSLINE_COMMAND,
    padding: 0,
  };

  writeSettings(settings);
  console.log("✅ statusLine 설정 완료! 다음 Claude Code 세션부터 적용됩니다.");
}

export async function setup(): Promise<void> {
  console.log("✔ usage-statusbar 설치 완료!");
  applySettings();
}

export async function remove(): Promise<void> {
  const settings = readSettings();

  if (!settings.statusLine?.command?.includes("usage-statusbar")) {
    console.log("ℹ️ statusLine 설정이 존재하지 않습니다.");
    return;
  }

  delete settings.statusLine;
  writeSettings(settings);
  console.log("✅ statusLine 설정이 제거되었습니다. 다음 Claude Code 세션부터 적용됩니다.");
}
