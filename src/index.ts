#!/usr/bin/env node

import { renderBar, formatDuration } from "./render";
import { fetchUsage } from "./usage-api";
import { setup, remove } from "./setup";

type StatusLineInput = {
  context_window?: {
    used_percentage?: number;
  };
};

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

  // 5-hour block usage from API
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
        hour12: false,
      });
    }

    console.log(
      `🧠 ${contextBar}${Math.round(contextPct)}% ⏰ ${blockBar}${Math.round(usage.fiveHourPct)}% 🔄 ${resetKST}(-${resetTime})`
    );
  } else {
    console.log(`🧠 ${contextBar}${Math.round(contextPct)}%`);
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
