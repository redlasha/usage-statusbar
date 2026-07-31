import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/**
 * 현재 Claude Code 세션이 어느 계정으로 도는지 판별한다.
 *
 * 한 사람이 개인 org와 팀 org를 함께 쓰면 이메일이 같으므로,
 * 유일한 판별자는 organizationUuid다.
 *
 * claude-swap 같은 전환 도구는 계정을 바꿀 때 .claude.json을 갱신하므로,
 * 이 파일이 전환을 가장 싸게 감지할 수 있는 소스다.
 */

/** CLAUDE_CONFIG_DIR가 있으면 그 안, 없으면 $HOME 바로 아래 (Claude Code 규칙) */
const CLAUDE_JSON = join(process.env.CLAUDE_CONFIG_DIR ?? homedir(), ".claude.json");
const SWAP_SEQUENCE = join(homedir(), ".claude-swap-backup", "sequence.json");

export type Account = {
  /** 계정 판별자 겸 캐시 키 */
  orgUuid: string;
  orgName: string;
  /** claude-swap 슬롯 번호. 미사용이거나 매칭 실패 시 null */
  slot: number | null;
  /** 표시용 짧은 이름 */
  label: string;
};

/** "someone@example.com's Organization" 같은 개인 org 이름은 길어서 그대로 못 쓴다 */
function shortLabel(orgName: string): string {
  if (/'s Organization$/.test(orgName)) return "personal";
  return orgName.length > 12 ? `${orgName.slice(0, 12)}…` : orgName;
}

/** claude-swap 스토어에서 orgUuid → 슬롯 번호 역인덱싱 (없으면 조용히 무시) */
function findSlot(orgUuid: string): number | null {
  try {
    const seq = JSON.parse(readFileSync(SWAP_SEQUENCE, "utf8"));
    for (const [num, acct] of Object.entries<any>(seq?.accounts ?? {})) {
      if (acct?.organizationUuid === orgUuid) return Number(num);
    }
  } catch {
    // claude-swap을 안 쓰는 환경
  }
  return null;
}

export function getAccount(): Account | null {
  try {
    const config = JSON.parse(readFileSync(CLAUDE_JSON, "utf8"));
    const orgUuid = config?.oauthAccount?.organizationUuid;
    if (!orgUuid) return null;

    const orgName = config?.oauthAccount?.organizationName ?? "unknown";

    return {
      orgUuid,
      orgName,
      slot: findSlot(orgUuid),
      label: shortLabel(orgName),
    };
  } catch {
    return null;
  }
}
