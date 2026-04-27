# call-me-skill

> Claude Code calls your name out loud when it needs your attention.

You're deep in another window. Claude finishes a long task, hits a question
it can't answer, or fails a build. Instead of a beep you might miss, it plays
a short musical sting and says:

> "Ziv, my man, calling from desktop 2: render finished."

Built for Windows. Uses your existing ElevenLabs voice for TTS and ships with
10 pre-bundled Lyria 2 intro chimes you audition during setup.

## Why

Beeps blend in. A short chime + a real voice saying your name + which desktop
the calling window is on cuts through everything else you're doing. The
desktop number tells you exactly where to look (Win+Tab, click that desktop).

A planned v0.2 adds a hotkey daemon: double-tap Ctrl to jump straight to the
window that called you, even across virtual desktops.

## Install

```bash
npm install -g @kivimedia/call-me-skill
call-me-skill setup
```

The wizard asks 8 questions:

1. **Your name** - what Claude calls you ("Ziv")
2. **Your gender** - shapes complimentary phrasing ("you nailed it" vs "she nailed it")
3. **Helper gender** - male / female / neutral, drives the addressing style ("my man" / "my dear" / "friend")
4. **Sentence length** - short / medium / long
5. **Intro music** - audition any of the 10 bundled Lyria chimes, pick one or `none`
6. **ElevenLabs API key** - get one at <https://elevenlabs.io/app/settings/api-keys>
7. **Voice picker** - lists the voices in your ElevenLabs account; the default Adam voice is excluded so you have to pick something distinctive
8. **Test alert** - plays a "setup complete" call so you can hear the result end to end

Config lives in `~/.config/call-me-skill/config.json`. Secrets go in
`~/.config/call-me-skill/.env` with `0600` perms. Nothing is ever written to
the repo.

## Use

### From the command line

```bash
call-me-skill speak "render finished"
# Plays: <chime> "Ziv, my man, calling from desktop 2: render finished."
```

Options:

```
--length short|medium|long   Override the configured sentence length
--no-intro                   Skip the intro chime
```

### From a Claude Code skill

Add it to any Claude Code project as a skill:

```md
---
name: call-me
description: Call Ziv out loud when you need his attention
---

When you finish a long task, hit a question you can't answer, or need
human input, run:

  call-me-skill speak "<one short sentence about what's up>"

Keep the message under 8 words. The skill prepends "{name}, calling from
desktop {N}, " automatically.
```

Then in any conversation: `/call-me` and the model will use it.

## How it works

1. **Compose** - reads your config, picks a random phrasing template for your
   helper gender + chosen length, substitutes `{name}`, `{address}`,
   `{desktop}`, `{message}`.
2. **Detect desktop** - reads
   `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops`
   to find the current desktop's index out of N. Also captures the foreground
   window handle (used by the planned daemon to jump back).
3. **TTS** - sends the sentence to ElevenLabs with your chosen voice.
4. **Play** - PowerShell `System.Windows.Media.MediaPlayer` plays the intro
   chime then the speech, back to back. End users only hear the first ~2-3s
   of each 30s Lyria clip - playback is capped at the queue level.

## Roadmap

v0.1 (this release):
- [x] CLI: `setup`, `speak`
- [x] 10 bundled Lyria intro chimes
- [x] ElevenLabs voice picker (excludes default Adam)
- [x] Gender-aware phrasing templates (3 helpers x 3 lengths)
- [x] Windows desktop number detection

v0.2 (next):
- [ ] **Hotkey daemon** - background process that listens for:
  - Double-tap Ctrl: jump to the desktop + window of the last call
  - Win+Ctrl+1..9: jump to desktop N (works around the broken built-in shortcut)
- [ ] **Voice mode toggle** - `call-me-skill mode on|off`. When on, Claude
  Code's Stop hook auto-fires `speak` with a short summary every time the
  agent stops.
- [ ] **macOS / Linux** support (Mission Control / GNOME Activities)
- [ ] **JumpToDesktop.exe** - tiny C# helper that calls
  `IVirtualDesktopManagerInternal::SwitchDesktop` directly
- [ ] **npm publish** to `@kivimedia/call-me-skill`

## Maintainer notes

The 10 bundled intros are Lyria 2 generations. To regenerate them:

```bash
GOOGLE_VERTEX_SA_JSON_FILE=C:/path/to/sa.json npm run gen-intros
```

The service account needs `roles/aiplatform.user` on a project with the
Vertex AI API enabled and access to `lyria-002` in `us-central1`.

End users do **not** need any Google credentials - the WAVs ship with the
package.

## License

MIT (c) 2026 Kivi Media. See [LICENSE](./LICENSE).
