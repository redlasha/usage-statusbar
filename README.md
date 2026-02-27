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
npm install -g usage-statusbar
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
| 🧠 Context | Claude Code stdin | Context window usage percentage |
| ⏰ Usage | Anthropic OAuth API | 5-hour rolling block utilization |
| 🔄 Reset | Anthropic OAuth API | Next reset time (KST) and countdown |

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
3. Usage quota % and reset time are fetched from `api.anthropic.com/api/oauth/usage`
4. OAuth token is read from `~/.claude/.credentials.json` (Linux/WSL) or macOS Keychain

## Requirements

- Node.js 18+
- Claude Code with an active session (for OAuth credentials)

## License

MIT
