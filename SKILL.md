---
name: call-me
description: Voice-call the user out loud through their speakers when you need their attention. Invoke with `/call-me <message>` or `/call-me` (no args - then ping with a generic "your turn"). Also triggers when the user says "call me", "ping me out loud", "voice ping", "alert me on speakers", "say it out loud", or any equivalent - or proactively when you finish a long-running task, hit a question only the user can answer, fail a build/deploy, or have been blocked >30s waiting on the user. Plays a short musical chime then a TTS sentence saying their name, which Windows desktop the calling window is on, and a one-line message.
---

# call-me

You have access to a CLI installed on this machine: `call-me-skill`.

When this file is installed as `~/.claude/skills/call-me/SKILL.md`, Claude Code exposes it as the **`/call-me`** slash command.

## Slash-command usage

When the user types `/call-me <message>`:
- Use `<message>` verbatim as the spoken text. Do NOT rephrase, expand, or add a name prefix - the CLI already prepends the user's name and desktop number.
- Run: `call-me-skill speak "<message>"` (quote properly, escape inner quotes).

When the user types `/call-me` with no args:
- Ping with a short generic line based on session state. Examples: "your turn", "ready when you are", "blocked, need you". 5-8 words max.
- Run: `call-me-skill speak "<your generic line>"`.

## How to invoke (programmatic / proactive)

Run via shell:

```
call-me-skill speak "<one short sentence>"
```

The CLI will:
1. Play the user's chosen intro chime (~2-3s)
2. Speak a sentence in this shape: `"{name}, {address}, calling from desktop {N}, {your message}."`

You only supply the `{your message}` part. Everything else (name, address, desktop number, voice, tone) is configured by the user during `setup` and should not be overridden.

## When to call

Good triggers:
- User explicitly asks: "call me", "use the call me skill", "ping me", "alert me", "say it out loud"
- You finished a long-running task and have results to show
- You need a decision or input you can't make on your own
- A build/test/deploy failed in a way that needs the user to look
- You've been blocked for more than ~30 seconds waiting on something the user controls

Bad triggers:
- Routine progress updates ("step 3 of 7 done")
- Things you can verify and fix yourself
- Anything happening in the foreground window the user is already watching

## Pair voice ping with window-foreground (recommended)

When you ping the user to DO something (type a password, click a 2FA, accept an OAuth consent), bring the relevant window to the foreground at the same time. A voice ping that says "go to the consent dialog" is useless if the user has to alt-tab through 20 windows to find it. Foreground the target window first, then voice-ping referencing what's now visible.

## Message style

Keep it short. 5-8 words is the sweet spot. The CLI prepends the addressing
boilerplate, so don't repeat the user's name yourself.

Good:
- `call-me-skill speak "render finished, 2 minutes saved"`
- `call-me-skill speak "build broke on line 47"`
- `call-me-skill speak "need your call on the migration"`

Bad:
- `call-me-skill speak "Hi {name}, I just wanted to let you know that..."` (too long, repeats name)
- `call-me-skill speak "done"` (too vague)
- `call-me-skill speak "Step 3 of 7 complete, moving to step 4"` (routine progress)

## Options

```
--length short|medium|long   Override the configured sentence length for this call
--no-intro                   Skip the chime (use sparingly - the chime is the cue)
--focus <pattern|alias>      Window the daemon hotkey will foreground when the user
                             presses Win+Ctrl+J (aliases: vscode, cursor, chrome,
                             edge, firefox, terminal; or any window-title substring)
```

## Subcommands (for reference)

- `call-me-skill setup` - first-run wizard (8 questions)
- `call-me-skill speak "<msg>"` - main verb (above)
- `call-me-skill jump <N>` - switch Windows to virtual desktop N (1-based)
- `call-me-skill daemon start|stop|status|install|uninstall` - hotkey daemon (Win+Ctrl+J jumps to last call's desktop+window)
- `call-me-skill mode on|off` - voice-mode toggle for Stop hook (v0.3)

## If the CLI is missing

If `call-me-skill` is not installed, fall back to a normal text response and
mention to the user: "Heads up - `call-me-skill` isn't installed. Run
`npm install -g @kivimedia/call-me-skill && call-me-skill setup` if you want
voice alerts."

Do not try to install it yourself.
