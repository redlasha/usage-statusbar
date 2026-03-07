# AI Coding Agent CLI Statusline Comparison

Claude Code, Codex CLI (OpenAI), Gemini CLI (Google) 세 에이전트의 상태라인(statusline) 기능과 확장성을 비교 조사한 문서.

> 조사일: 2026-02-28

## 요약

| 기능 | Claude Code | Codex CLI | Gemini CLI |
|------|-------------|-----------|------------|
| 내장 상태라인 | O | O | O |
| 외부 명령으로 커스텀 콘텐츠 주입 | **O** (`statusLine.command`) | X | X |
| 훅(Hook) 시스템 | 중간 | 최소 (1개 이벤트) | 풍부 (11개 이벤트) |
| 확장/플러그인 시스템 | MCP | MCP + Skills | Extensions + MCP + Hooks + 커맨드 |
| 서드파티 상태라인 아이템 추가 | **가능** | 불가 | 불가 |

**핵심:** Claude Code만이 외부 명령의 stdout을 상태라인에 직접 표시하는 메커니즘(`statusLine.command`)을 제공한다. 이것이 `usage-statusbar` 같은 확장이 가능한 이유이며, Codex/Gemini에서는 동일한 방식으로 구현할 수 없다.

---

## 1. Claude Code

### 상태라인 구조

`~/.claude/settings.json`에서 설정:

```json
{
  "statusLine": {
    "type": "command",
    "command": "usage-statusbar",
    "padding": 0
  }
}
```

- `type: "command"` — 외부 CLI 명령을 실행하고, 그 **stdout을 상태라인에 그대로 표시**
- Claude Code가 stdin으로 세션 JSON 데이터를 파이프 (context_window.used_percentage 등 포함)
- ANSI 색상 코드 지원

### 확장 메커니즘

| 메커니즘 | 설명 |
|----------|------|
| statusLine.command | 외부 명령 stdout을 상태라인에 표시 |
| Hooks | PreToolUse, PostToolUse 등 셸 스크립트 실행 |
| MCP 서버 | Model Context Protocol 기반 도구 확장 |
| settings.json | 전역/프로젝트별 설정 |

### 커스텀 상태라인의 장점

- **자유도 최고**: stdout으로 출력하는 것이면 무엇이든 표시 가능
- 외부 API 호출, 파일 읽기, 시스템 정보 등 제한 없음
- npm 패키지로 배포 + postinstall 자동 설정 가능
- ANSI 이스케이프로 색상/스타일 자유롭게 제어

---

## 2. Codex CLI (OpenAI)

> GitHub: https://github.com/openai/codex

### 상태라인 구조

`~/.codex/config.toml`의 `[tui]` 섹션에서 설정:

```toml
[tui]
status_line = ["model", "context-remaining", "git-branch"]
```

기본값: `["model-with-reasoning", "context-remaining", "current-dir"]`

`/statusline` 슬래시 커맨드로 대화형 토글/재정렬도 가능.

### 내장 상태라인 아이템

| 아이템 ID | 설명 |
|-----------|------|
| `model` | 현재 모델명 |
| `model-with-reasoning` | 모델명 + 추론 수준 표시 |
| `approval` | 승인 정책 (Ask/Never/Any) |
| `sandbox` | 샌드박스 모드 |
| `session-id` | 스레드 ID (축약) |
| `directory` / `current-dir` | 현재 작업 디렉토리 |
| `branch` / `git-branch` | Git 브랜치명 |
| `context-remaining` | 컨텍스트 윈도우 사용량 |
| `rate-limit` | 레이트 리밋 정보 |
| `token-counters` | 토큰 사용 카운터 |
| `version` | Codex 버전 |

### 커스텀 상태라인이 불가능한 이유

- 아이템이 Rust 코드의 `StatusLineItem` enum에 **하드코딩**
- 새 아이템 추가 시 enum 확장 + 렌더링 로직 + 설정 파서 수정 필요
- **서드파티가 커스텀 아이템을 추가할 방법이 없음** (포크 필요)

### 확장 메커니즘

| 메커니즘 | 설명 |
|----------|------|
| MCP 서버 | config.toml에서 외부 도구 서버 연결 |
| Skills | SKILL.md + scripts/ 기반 재사용 워크플로 |
| notify | 유일한 훅 이벤트 (agent-turn-complete만 지원) |
| Custom Slash Commands | 팀/개인 커스텀 명령 |

### 우회 방법

[codex-hud](https://github.com/fwyc0573/codex-hud) — tmux 분할 패널로 별도 HUD 표시:
- 토큰 사용량 (input/cache/output 분리)
- 컨텍스트 윈도우 사용률 시각화
- 도구 활동 추적, Git 상태
- 데이터 소스: Codex 세션 rollout JSONL 파일

---

## 3. Gemini CLI (Google)

> GitHub: https://github.com/google-gemini/gemini-cli

### 상태라인 구조

두 가지 영역이 존재:

**컨텍스트 요약 (상단)** — `ContextSummaryDisplay` 컴포넌트:
```
1 open file (ctrl+g to view) | 2 GEMINI.md files | 1 MCP server | 3 skills
```
- `ui.hideContextSummary`로 숨김 가능

**풋터 (하단):**
- 현재 작업 디렉토리 (`ui.footer.hideCWD`)
- 샌드박스 상태 (`ui.footer.hideSandboxStatus`)
- 모델명 + 컨텍스트 사용률 (`ui.footer.hideModelInfo`, `ui.footer.hideContextPercentage`)
- `ui.hideFooter`로 전체 숨김 가능

**터미널 타이틀:**
- `ui.showStatusInTitle` — 작업 중 모델 상태를 터미널 타이틀에 표시
- `ui.dynamicWindowTitle` — 상태 아이콘 (Ready/Working/Action Required)

### 커스텀 상태라인이 불가능한 이유

- 상태라인과 풋터가 내부 React(Ink) 컴포넌트로 구현
- 외부 확장이 이 컴포넌트에 콘텐츠를 주입할 공개 API가 없음
- 훅의 `systemMessage`로 일시적 메시지 표시는 가능하지만 **상시 표시는 불가**

### 확장 메커니즘

Gemini CLI는 세 에이전트 중 확장 시스템이 가장 풍부하다:

| 메커니즘 | 설명 |
|----------|------|
| Extensions | 종합 패키지 (프롬프트, MCP, 커맨드, 테마, 훅, 에이전트, 스킬, 정책) |
| Hooks (11개) | BeforeTool, AfterTool, BeforeAgent, AfterAgent, BeforeModel, AfterModel, BeforeToolSelection, SessionStart, SessionEnd, Notification, PreCompress |
| MCP 서버 | 외부 도구 통합 |
| Plugin Hooks | npm 패키지 기반, TypeScript 인터페이스, DI 지원 |
| 커스텀 커맨드 | TOML 파일로 슬래시 커맨드 정의 |
| 테마 | 커스텀 색상 테마 |
| Extensions Gallery | 공식 확장 갤러리 + GitHub 조직 |

### 훅 시스템 상세

```json
{
  "hooks": {
    "BeforeTool": [{
      "matcher": "write_file|replace",
      "hooks": [{
        "name": "security-check",
        "type": "command",
        "command": ".gemini/hooks/security.sh",
        "timeout": 5000
      }]
    }]
  }
}
```

훅 출력의 `systemMessage` 필드로 사용자에게 메시지 표시 가능 (일시적).

### 대안 구현 전략

Gemini CLI에서 사용량 정보를 표시하려면:

1. **Extension 패키지** 생성 (`gemini-extension.json`)
2. **SessionStart 훅** — 세션 시작 시 `systemMessage`로 사용량 표시
3. **커스텀 슬래시 커맨드** (`/usage`) — 온디맨드 사용량 조회
4. **MCP 서버** — 사용량 확인 도구 제공

---

## 구현 가능성 정리

### 동일한 "항상 보이는 상태라인" 구현

| 에이전트 | 가능 여부 | 방법 |
|----------|-----------|------|
| Claude Code | **가능** | `statusLine.command` (현재 구현) |
| Codex CLI | **불가** (우회만 가능) | tmux 분할 패널 (codex-hud 방식) |
| Gemini CLI | **불가** (우회만 가능) | Extension + 슬래시 커맨드로 온디맨드 조회 |

### 각 에이전트에서의 현실적 접근

**Codex CLI:**
- tmux 래퍼 스크립트로 Codex 옆에 HUD 패널 실행
- 세션 JSONL 파일을 파싱해서 사용량 데이터 추출
- `notify` 훅으로 턴 완료 시 HUD 갱신 트리거
- 참고: 커뮤니티에서 포괄적 훅 시스템 요청 중 (Discussion #2150, 151 upvotes)

**Gemini CLI:**
- Extension으로 패키징 (Extensions Gallery 등록 가능)
- `SessionStart` 훅 + `systemMessage`로 세션 시작 시 사용량 표시
- `/usage` 커스텀 커맨드로 언제든 사용량 확인
- `BeforeModel` 훅에서 주기적으로 사용량 갱신 표시 가능
- 근본적 한계: 상시 표시되는 상태라인은 불가

---

## 참고 자료

### Claude Code
- [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code)

### Codex CLI
- [Config Reference](https://developers.openai.com/codex/config-reference/)
- [Sample Config](https://developers.openai.com/codex/config-sample/)
- [Customization](https://developers.openai.com/codex/concepts/customization/)
- [codex-hud](https://github.com/fwyc0573/codex-hud)
- [Status Line DeepWiki](https://deepwiki.com/openai/codex/4.1.4-status-line-and-footer-rendering)
- [Hook Discussion #2150](https://github.com/openai/codex/discussions/2150)

### Gemini CLI
- [Gemini CLI Docs](https://geminicli.com/docs/)
- [Hooks Documentation](https://geminicli.com/docs/hooks/)
- [Hooks Reference](https://geminicli.com/docs/hooks/reference/)
- [Extensions Documentation](https://geminicli.com/docs/extensions/)
- [Extension Reference](https://geminicli.com/docs/extensions/reference/)
- [Configuration Reference](https://geminicli.com/docs/reference/configuration/)
- [Extensions Gallery](https://geminicli.com/extensions/)
