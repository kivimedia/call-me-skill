---
name: call-me
description: Voice-call the user out loud through their speakers when you need their attention. Plays a short musical chime then a TTS sentence saying their name, which Windows desktop the calling window is on, and a one-line message. Use when you finish a long task, hit a question you can't answer, fail a build, or otherwise need a human in the loop.
---

# call-me

You have access to a CLI installed on this machine: `call-me-skill`.

When you need the user's attention, run:

```
call-me-skill speak "<one short sentence>"
```

The CLI will:
1. Play the user's chosen intro chime (~2-3s)
2. Speak a sentence in this shape: `"{name}, {address}, calling from desktop {N}, {your message}."`

You only supply the `{your message}` part. Everything else (name, address,
desktop number, voice, tone) is configured by the user during `setup` and
should not be overridden.

## When to call

Good triggers:
- You finished a long-running task and have results to show
- You need a decision or input you can't make on your own
- A build/test/deploy failed in a way that needs the user to look
- You've been blocked for more than ~30 seconds waiting on something the user controls

Bad triggers:
- Routine progress updates ("step 3 of 7 done")
- Things you can verify and fix yourself
- Anything happening in the foreground window the user is already watching

## Message style

Keep it short. 5-8 words is the sweet spot. The CLI prepends the addressing
boilerplate, so don't repeat the user's name yourself.

Good:
- `call-me-skill speak "render finished, 2 minutes saved"`
- `call-me-skill speak "build broke on line 47"`
- `call-me-skill speak "need your call on the migration"`

Bad:
- `call-me-skill speak "Hi Ziv, I just wanted to let you know that..."` (too long, repeats name)
- `call-me-skill speak "done"` (too vague)
- `call-me-skill speak "Step 3 of 7 complete, moving to step 4"` (routine progress)

## Options

```
--length short|medium|long   Override the configured sentence length for this call
--no-intro                   Skip the chime (use sparingly - the chime is the cue)
```

## If the CLI is missing

If `call-me-skill` is not installed, fall back to a normal text response and
mention to the user: "Heads up - `call-me-skill` isn't installed. Run
`npm install -g @kivimedia/call-me-skill && call-me-skill setup` if you want
voice alerts."

Do not try to install it yourself.
