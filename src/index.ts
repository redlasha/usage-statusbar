#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { renderBar, renderAccount, formatDuration } from "./render";
import { fetchUsage } from "./usage-api";
import { setup, remove } from "./setup";

type StatusLineInput = {
  context_window?: {
    used_percentage?: number;
  };
  cwd?: string;
  workspace?: {
    current_dir?: string;
  };
};

/**
 * 현재 디렉터리가 git worktree인지 감지하고 브랜치명을 반환.
 * worktree는 `.git`이 파일이며 `gitdir: <path>` 형식.
 */
function detectWorktree(cwd: string): { isWorktree: boolean; branch?: string } {
  try {
    let dir = cwd;
    // 상위로 올라가며 .git 탐색
    for (let i = 0; i < 20; i++) {
      const dotGit = path.join(dir, ".git");
      let stat: fs.Stats;
      try {
        stat = fs.statSync(dotGit);
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) return { isWorktree: false };
        dir = parent;
        continue;
      }

      if (stat.isDirectory()) {
        // 일반 repo (worktree 아님)
        return { isWorktree: false };
      }

      // .git이 파일 → worktree
      const content = fs.readFileSync(dotGit, "utf8").trim();
      const m = content.match(/^gitdir:\s*(.+)$/);
      if (!m) return { isWorktree: true };

      let gitdir = m[1];
      if (!path.isAbsolute(gitdir)) {
        gitdir = path.resolve(dir, gitdir);
      }

      // HEAD 읽어 브랜치 추출
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
    // ignore
  }
  return { isWorktree: false };
}

/**
 * 시간을 "PM3", "AM11" 형식으로 포맷 (KST).
 */
function formatHourKST(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${dayPeriod}${hour}`;
}

async function statusline() {
  let input: StatusLineInput = {};

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const stdinText = Buffer.concat(chunks).toString("utf8");
    if (stdinText.trim()) {
      input = JSON.parse(stdinText);
    }
  } catch {
    // Ignore parse errors
  }

  // Context window from stdin
  const contextPct = input.context_window?.used_percentage ?? 0;
  const contextBar = renderBar(contextPct);

  // Worktree 감지
  const cwd = input.workspace?.current_dir ?? input.cwd ?? process.cwd();
  const wt = detectWorktree(cwd);
  const wtPrefix = wt.isWorktree
    ? `🌿 ${wt.branch ?? "wt"} `
    : "";

  // 5-hour block usage from API
  const usage = await fetchUsage();

  if (usage) {
    const acct = renderAccount(usage.account);
    const blockBar = renderBar(usage.fiveHourPct);
    const resetTime = formatDuration(usage.fiveHourResetMs);

    const resetKST = usage.fiveHourResetAt
      ? formatHourKST(usage.fiveHourResetAt)
      : "";

    console.log(
      `${wtPrefix}${acct}🧠 ${contextBar}${Math.round(contextPct)}% ⏰ ${blockBar}${Math.round(usage.fiveHourPct)}% 🔄 ${resetKST}(-${resetTime})`
    );
  } else {
    console.log(`${wtPrefix}🧠 ${contextBar}${Math.round(contextPct)}%`);
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
  console.log("🧠 ░░░░░--%");
});
