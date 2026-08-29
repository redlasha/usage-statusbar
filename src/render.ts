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

/**
 * 모델명(display_name)을 비용 등급에 따라 색상을 입혀 반환.
 * - Opus: red   (가장 비쌈)
 * - Sonnet: yellow
 * - Fable/Haiku: green (가장 저렴)
 * - 그 외: dim
 */
export function renderModel(displayName: string): string {
  const name = displayName.toLowerCase();
  let color = ANSI.dim;
  if (name.includes("opus")) color = ANSI.red;
  else if (name.includes("sonnet")) color = ANSI.yellow;
  else if (name.includes("fable") || name.includes("haiku")) color = ANSI.green;

  return `${color}${displayName}${ANSI.reset}`;
}

/**
 * 프롬프트 캐시 히트율. hit_ratio는 높을수록 좋으므로 usage 바와 색 기준이 반대다.
 */
export function renderCacheHitRatio(hitRatio: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, hitRatio)) * 100);
  const color = pct >= 80 ? ANSI.green : pct >= 50 ? ANSI.yellow : ANSI.red;
  return `${color}💾${pct}%${ANSI.reset}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0";

  const hours = ms / 3600000;
  return hours.toFixed(1);
}
