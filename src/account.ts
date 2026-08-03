import { readFileSync } from "fs";
import { CLAUDE_JSON, SWAP_SEQUENCE } from "./profile";

/**
 * 현재 Claude Code 세션이 어느 계정으로 도는지 판별한다.
 *
 * 한 사람이 개인 org와 팀 org를 함께 쓰면 이메일이 같으므로,
 * 유일한 판별자는 organizationUuid다.
 *
 * 정본은 access token이다 (identity.ts가 토큰으로 org를 확정한다). .claude.json은
 * 토큰으로 확정하지 못할 때만 쓰는 폴백인데, 이 파일은 "그 프로필이 어느 계정이라고
 * 주장하는가"일 뿐 실제로 어느 계정 쿼터를 쓰는지와 어긋날 수 있다.
 */

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

/** org 식별자에 표시용 정보(슬롯/짧은 이름)를 붙인다 */
export function toAccount(orgUuid: string, orgName: string): Account {
  return {
    orgUuid,
    orgName,
    slot: findSlot(orgUuid),
    label: shortLabel(orgName),
  };
}

/** 폴백: 프로필의 .claude.json이 주장하는 계정 */
export function getAccountFromConfig(): Account | null {
  try {
    const config = JSON.parse(readFileSync(CLAUDE_JSON, "utf8"));
    const orgUuid = config?.oauthAccount?.organizationUuid;
    if (!orgUuid) return null;

    const orgName = config?.oauthAccount?.organizationName ?? "unknown";
    return toAccount(orgUuid, orgName);
  } catch {
    return null;
  }
}
