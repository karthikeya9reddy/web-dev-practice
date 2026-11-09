# Durable checkpoint policy

Use this policy during every NEXORA Work session. A conversational progress message is not a durable project checkpoint. Save the state in files.

## When to checkpoint

Create a checkpoint:

- After baseline discovery and before the first code edit.
- Before a risky refactor or dependency update.
- After each independently testable engineering phase.
- After every material group of source changes.
- After a test batch and after updating its report.
- Before ending a session or handing work to another session.

## Required update order

1. Update `RECOVERY-STATE.json` with the current phase, exact next action, changed files, test command/results and unresolved blockers.
2. Append a dated entry to `SESSION-LOG.md`.
3. Update `NEXT-ACTION.md` so another session can continue without reconstructing intent.
4. Run `python3 scripts/nexora_checkpoint.py --label "short-phase-name"`.
5. Keep the resulting ZIP and `.sha256` sidecar outside the active project folder.
6. Verify it with `python3 scripts/nexora_checkpoint.py --verify /path/to/checkpoint.zip`.

## Recovery after interruption

Reattach the most recent verified checkpoint ZIP to the new Work session and use `RESUME-PROMPT.txt`. Do not rely on an earlier chat transcript as the only record of completed changes. The new session must inspect the saved state and verify the checkpoint before continuing.

## Retention

Keep at least: (a) the original uploaded archive, (b) the latest verified checkpoint, and (c) the previous verified checkpoint. Store copies in two independent locations when practical. Do not overwrite the original.

## What the checkpoint utility excludes

The utility intentionally excludes `.git` internals, dependency directories, caches, generated build folders, `Entertainment`, log/temp files, symlinks and `.env` secrets. Keep personal media, credentials and any required environment configuration in a separate secure backup. Verify the exclusion list before relying on a checkpoint for a deployment.

## Scope limitation

This process does not prevent ChatGPT Work, browser, network or tool connection failures. It prevents those interruptions from forcing the entire project history and work state to be recreated, provided the latest verified checkpoint has been saved.
