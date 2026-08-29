#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { renderBar, renderAccount, renderModel, renderCacheHitRatio, formatDuration } from "./render";
import { fetchUsage, type RateLimits } from "./usage-api";
import { setup, remove } from "./setup";

type StatusLineInput = {
  context_window?: {
    used_percentage?: number;
  };
  cwd?: string;
  /** `--name` / `/rename`으로 설정했거나 AI가 생성한 제목이 있을 때만 존재 */
  session_name?: string;
  workspace?: {
    current_dir?: string;
  };
  model?: {
    id?: string;
    display_name?: string;
  };
  /**
   * Claude Code 2.1+ 가 실어 보내는 rate limit. 세션 자신의 추론 응답 헤더
   * (anthropic-ratelimit-unified-*)에서 나오므로 조회 비용이 없고 항상 최신이다.
   */
  rate_limits?: RateLimits;
  /** 메인 대화의 프롬프트 캐시 통계. 세션 첫 API 응답 이후부터 존재 */
  prompt_cache?: {
    hit_ratio?: number;
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
 * 시간을 "PM3:05", "AM11:33" 형식으로 포맷 (KST).
 */
function formatHourKST(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return `${dayPeriod}${hour}:${minute}`;
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

  // 세션명 (세션 간 메시지 주고받을 때 어느 세션인지 구분용)
  const sessionName = input.session_name?.trim();
  const sessionPrefix = sessionName ? `🏷️ ${sessionName} ` : "";

  // 모델명 (비용 등급별 색상)
  const modelName = input.model?.display_name;
  const modelPrefix = modelName ? `${renderModel(modelName)} ` : "";

  // 프롬프트 캐시 히트율
  const hitRatio = input.prompt_cache?.hit_ratio;
  const cachePrefix = hitRatio !== undefined ? `${renderCacheHitRatio(hitRatio)} ` : "";

  // 5-hour block usage — stdin에 실려오면 그걸 쓰고, 없을 때만 API 조회
  const usage = await fetchUsage(input.rate_limits);

  if (usage) {
    const acct = renderAccount(usage.account);
    const blockBar = renderBar(usage.fiveHourPct);
    const resetTime = formatDuration(usage.fiveHourResetMs);

    const resetKST = usage.fiveHourResetAt
      ? formatHourKST(usage.fiveHourResetAt)
      : "";

    console.log(
      `${wtPrefix}⏰ ${blockBar}${Math.round(usage.fiveHourPct)}% 🔄 ${resetKST}(-${resetTime}) 🧠 ${contextBar}${Math.round(contextPct)}% ${sessionPrefix}${modelPrefix}${acct}${cachePrefix}`.trimEnd()
    );
  } else {
    console.log(
      `${wtPrefix}🧠 ${contextBar}${Math.round(contextPct)}% ${sessionPrefix}${modelPrefix}${cachePrefix}`.trimEnd()
    );
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
