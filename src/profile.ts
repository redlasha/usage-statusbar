import { realpathSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

/**
 * 프로필 경로 해석.
 *
 * `cswap map` / `cswap run` 같은 세션 모드는 CLAUDE_CONFIG_DIR로 계정마다 별도
 * 프로필 디렉터리를 쓴다. 기본 프로필(~/.claude)인지 여부가 중요한 이유는
 * macOS Keychain 때문이다: "Claude Code-credentials" 아이템은 시스템에 하나뿐이고
 * 언제나 "전역 활성 계정"의 것이다. 별도 프로필에서 이 아이템을 읽으면 그 프로필과
 * 무관한 계정의 토큰을 쓰게 되고, 결과적으로 남의 계정 쿼터가 이 계정 이름표를 달고
 * 표시된다. 그래서 Keychain 접근은 기본 프로필로만 한정한다.
 */

const DEFAULT_CONFIG_DIR = join(homedir(), ".claude");

export const CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR ?? DEFAULT_CONFIG_DIR;

/** 심볼릭 링크로 가리켜도 같은 디렉터리로 보도록 realpath까지 시도 */
function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Keychain을 이 프로필의 자격증명으로 취급해도 되는가 */
export const IS_DEFAULT_PROFILE =
  canonical(CONFIG_DIR) === canonical(DEFAULT_CONFIG_DIR);

/** Claude Code 규칙: 기본은 $HOME/.claude.json, CLAUDE_CONFIG_DIR가 있으면 그 안 */
export const CLAUDE_JSON = join(
  process.env.CLAUDE_CONFIG_DIR ?? homedir(),
  ".claude.json"
);

export const CREDENTIALS_FILE = join(CONFIG_DIR, ".credentials.json");
export const CACHE_FILE = join(CONFIG_DIR, ".claude-usage-cache.json");
export const SWAP_SEQUENCE = join(
  homedir(),
  ".claude-swap-backup",
  "sequence.json"
);
