# usage-statusbar

Claude Code statusline that shows what matters for subscription users.

```
🌿 my-branch ⏰ ███░░53% 🔄 PM8:30(-1.4) 🧠 ██░░░42% 🏷️ my-session Opus 5 👤1·personal 💾91%
```

- **🌿 Worktree** — branch name, only inside a git worktree
- **⏰ Usage** — 5-hour block usage %
- **🔄 Reset** — reset time (KST) and hours remaining
- **🧠 Context** — context window usage %
- **🏷️ Session** — session name, only once one is set
- **Model** — the main-loop model, colored by family
- **👤 Account** — which account this session runs as, only if more than one is set up
- **💾 Cache** — prompt cache hit ratio, only once available

Sections lead with what's most likely to make you stop and look — usage and reset —
then context, and the rest in decreasing order of urgency. Sections that do not apply are
omitted, so a single-account session in a plain checkout with no name set shows just
usage, reset, context, and model.

## Why

Most statusline tools focus on cost tracking. If you're on a Claude Pro/Team subscription, cost doesn't matter — **usage quota does**. This tool shows exactly that.

## Install

```bash
npm install -g @redlasha/usage-statusbar
```

The postinstall step writes the `statusLine` entry into `~/.claude/settings.json` for
you, and leaves it alone if one is already configured.

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
usage-statusbar --setup    # write the statusLine entry
usage-statusbar --remove   # take it back out
```

## Display

| Section | Source | Description |
|---------|--------|-------------|
| 🌿 Worktree | cwd | Branch name, shown only inside a git worktree |
| ⏰ Usage | Claude Code stdin (OAuth API fallback) | 5-hour rolling block utilization |
| 🔄 Reset | Claude Code stdin (OAuth API fallback) | Next reset time (KST) and hours remaining |
| 🧠 Context | Claude Code stdin | Context window usage percentage |
| 🏷️ Session | Claude Code stdin | Session name, shown only when set |
| Model | Claude Code stdin | Main-loop model, colored by family (opus / sonnet / fable-haiku) |
| 👤 Account | OAuth token | Which account this session runs as (see below) |
| 💾 Cache | Claude Code stdin | Prompt cache hit ratio, shown only once available |

### Session name

Useful when you have several sessions running at once and send messages between them —
the statusline tells you which session you're looking at. Shown only when the session
has a name (`session_name` in the stdin JSON, set with `--name`, `/rename`, or an
AI-generated title); the default `my-app-3f`-style name doesn't count, so most sessions
omit this section.

### Cache hit ratio

Claude Code tracks prompt cache performance for the main conversation and reports it via
`prompt_cache.hit_ratio` once the first API response comes back (Claude Code v2.1.251+).
A high ratio (green, ≥80%) means most of the context is being served from cache; a low
one (red, <50%) means the cache keeps going cold, which shows up as slower responses
regardless of cost. Absent until that first response, or on older Claude Code versions.

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

Bars are 5 cells of `█` (filled) / `░` (empty) — single-width Unicode, works on all
terminals. The thresholds apply to the 🧠 and ⏰ bars; the model name is colored by
family instead — opus red, sonnet yellow, fable/haiku green, anything else dim. 💾 uses
the same three colors but inverted, since a high hit ratio is good: green ≥80%, yellow
50-79%, red below 50%.

## How it works

1. Claude Code pipes JSON session data to the statusline command via stdin
2. Context window % is extracted from the JSON
3. Usage quota % and reset time come from that same JSON (`rate_limits`) when present —
   see below. Otherwise they are fetched from `api.anthropic.com/api/oauth/usage` and
   cached per account in `<profile>/.claude-usage-cache.json`
4. The OAuth token is read from `<profile>/.credentials.json`, falling back to the macOS
   Keychain **only for the default profile** (see below)
5. The token's org is resolved via `api.anthropic.com/api/oauth/profile`, cached by token
   fingerprint in `<profile>/.claude-identity-cache.json`

### Usage comes from the session, not a poll

Claude Code 2.1+ puts the current limits on the statusline payload:

```json
"rate_limits": {
  "five_hour": { "used_percentage": 23, "resets_at": 1785756600 },
  "seven_day": { "used_percentage": 2,  "resets_at": 1786305600 }
}
```

It builds those from the `anthropic-ratelimit-unified-*` headers on the session's own
inference responses, so they cost nothing to read, are as fresh as the last message, and
are unambiguously the account the session is actually running as. (`used_percentage` is
0–100; `resets_at` is epoch seconds — an ISO string is also accepted.)

Polling `/api/oauth/usage` instead meant every session and every account switcher shared
one per-token budget, and hitting it returned `429` with the quota numbers unavailable
right when you wanted them. That endpoint is now only a fallback for payloads without
`rate_limits` — an older Claude Code, or a session that has not made a request yet.

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
