/**
 * Unicode block bar graph renderer with ANSI colors
 * - 0-50%:  green  (█)
 * - 51-80%: yellow (█)
 * - 81-100%: red   (█)
 * - Empty:  dim    (░)
 */

const BAR_LENGTH = 5;

import type { Account } from "./account";

const ANSI = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[90m",
  reset: "\x1b[0m",
};

function getColor(percentage: number): string {
  if (percentage <= 50) return ANSI.green;
  if (percentage <= 80) return ANSI.yellow;
  return ANSI.red;
}

export function renderBar(percentage: number): string {
  const clampedPct = Math.min(100, Math.max(0, percentage));
  const filledCount = Math.round((clampedPct / 100) * BAR_LENGTH);
  const emptyCount = BAR_LENGTH - filledCount;

  const color = getColor(clampedPct);
  const filled = `${color}${"█".repeat(filledCount)}${ANSI.reset}`;
  const empty = `${ANSI.dim}${"░".repeat(emptyCount)}${ANSI.reset}`;

  return filled + empty;
}

/**
 * 계정 라벨. 슬롯마다 색을 달리해 전환을 한눈에 알아보게 한다.
 * 개인/팀 org를 함께 쓰면 이메일이 같으므로 org 이름이 유일한 구분점이다.
 */
export function renderAccount(account: Account | null): string {
  if (!account) return "";

  const color =
    account.slot === 1 ? ANSI.cyan : account.slot === 2 ? ANSI.magenta : ANSI.dim;
  const slot = account.slot !== null ? `${account.slot}·` : "";

  return `${color}👤${slot}${account.label}${ANSI.reset} `;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
