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
| 👤 Account | `~/.claude.json` | Which account this session runs as (see below) |
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
3. The active account is read from `~/.claude.json` (`oauthAccount.organizationUuid`)
4. Usage quota % and reset time are fetched from `api.anthropic.com/api/oauth/usage`,
   cached per account in `~/.claude/.claude-usage-cache.json`
5. OAuth token is read from `~/.claude/.credentials.json`, falling back to the macOS
   Keychain

On macOS the Keychain is the source of truth — account switchers update it without
touching `.credentials.json`, so a file-first read can silently serve the previous
account's token. To avoid a Keychain prompt on every refresh, the file is trusted unless
`.claude.json` is newer than it (which means the account just changed), or the API
answers `401`. In practice the Keychain is read about once per account switch.

`CLAUDE_CONFIG_DIR` is honored throughout, so per-terminal sessions (e.g. `cswap run`)
resolve their own profile rather than the default one.

## Requirements

- Node.js 18+
- Claude Code with an active session (for OAuth credentials)

## License

MIT
