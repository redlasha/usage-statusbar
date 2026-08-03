# usage-statusbar

Claude Code statusline that shows what matters for subscription users.

```
🧠 ████░░░░░░ 42% | ⏰ █████░░░░░ 53% | 🔄 03:00 (-2h 14m)
```

- **🧠 Context** — context window usage %
- **⏰ Usage** — 5-hour block usage % (Anthropic OAuth API)
- **🔄 Reset** — reset time (KST) and countdown

## Why

Most statusline tools focus on cost tracking. If you're on a Claude Pro/Team subscription, cost doesn't matter — **usage quota does**. This tool shows exactly that.

## Install

```bash
npm install -g @redlasha/usage-statusbar
```

The installer will ask to configure your `~/.claude/settings.json` automatically.

### Manual setup

If you skipped the auto-setup, add this to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "usage-statusbar",
    "padding": 0
  }
}
```

### Re-run setup

```bash
usage-statusbar --setup
```

## Display

| Section | Source | Description |
|---------|--------|-------------|
| 🌿 Worktree | cwd | Branch name, shown only inside a git worktree |
| 👤 Account | OAuth token | Which account this session runs as (see below) |
| 🧠 Context | Claude Code stdin | Context window usage percentage |
| ⏰ Usage | Anthropic OAuth API | 5-hour rolling block utilization |
| 🔄 Reset | Anthropic OAuth API | Next reset time (KST) and countdown |

### Account indicator

If you run more than one Claude account — a personal org and a team org, say — the
statusline shows which one the session is currently using:

```
👤1·personal    cyan     slot 1
👤2·Acme        magenta  slot 2
```

Accounts are identified by `organizationUuid`, not by email: the same email can belong
to several orgs, so the email alone cannot tell them apart. When
[claude-swap](https://github.com/realiti4/claude-swap) is installed, its slot number is
resolved from `~/.claude-swap-backup/sequence.json` and prefixed to the label. Without
it, only the org name is shown. The section disappears entirely if the account cannot be
determined.

The org is resolved from the **access token itself** (`/api/oauth/profile`), not from
what `.claude.json` claims. Those two can disagree — while a switch is in flight, or when
a profile's credentials belong to another account — and when they did, the statusline
showed one account's name above another account's quota. Deriving both from the token
makes that impossible; `.claude.json` is only a fallback when the token cannot be
resolved. The token→org answer is cached by token fingerprint, so this costs one extra
request per new token, not per refresh.

Usage is cached **per account**, so switching accounts updates the numbers immediately
rather than serving the previous account's quota until the cache expires.

### Color thresholds (ANSI)

| Range | Color | Meaning |
|-------|-------|---------|
| 0-50% | Green | Safe |
| 51-80% | Yellow | Moderate |
| 81-100% | Red | High |

Bar characters: `█` (filled) / `░` (empty) — single-width Unicode, works on all terminals.

## How it works

1. Claude Code pipes JSON session data to the statusline command via stdin
2. Context window % is extracted from the JSON
3. The OAuth token is read from `<profile>/.credentials.json`, falling back to the macOS
   Keychain **only for the default profile** (see below)
4. The token's org is resolved via `api.anthropic.com/api/oauth/profile`, cached by token
   fingerprint in `<profile>/.claude-identity-cache.json`
5. Usage quota % and reset time are fetched from `api.anthropic.com/api/oauth/usage`,
   cached per account in `<profile>/.claude-usage-cache.json`

`CLAUDE_CONFIG_DIR` is honored throughout, so per-terminal sessions (e.g. `cswap run`,
`cswap map`) resolve their own profile rather than the default one.

### Why the Keychain is default-profile only

On macOS the Keychain holds a single `Claude Code-credentials` item, and it always
belongs to whichever account is *globally* active. A non-default profile is a different
account by construction, so reading that item there hands the profile someone else's
token — and the old shadow-copy write then persisted it into the profile's
`.credentials.json`, which is enough to make the next launch of that session run as the
wrong account. So the Keychain is now consulted, and the shadow copy written, only when
the profile *is* `~/.claude`. A non-default profile owns its own `.credentials.json`; if
it is missing or expired the usage sections are omitted rather than filled in from
another account.

For the default profile the shadow copy can still lag behind a switch. That used to be
detected by comparing mtimes against `.claude.json`, but a running Claude Code rewrites
that file every few seconds, so the check read as "switched" on nearly every refresh —
a Keychain call per render that still never caught the switch. It now compares the org
the *token* resolves to against the org `.claude.json` claims, and only consults the
Keychain when they genuinely differ (or the token is expired, or the API answers `401`).

## Requirements

- Node.js 18+
- Claude Code with an active session (for OAuth credentials)

## License

MIT
