# NEXORA Work Recovery Kit

## Purpose

This folder exists so a ChatGPT Work connection interruption, browser refresh, session expiry, tool error or handoff does not force the NEXORA engineering operation to restart from zero.

A connection error cannot be prevented from inside the NEXORA application. It is a platform/network event outside this repository's control. This kit instead makes the work resumable from a durable local ZIP and explicit state files.

## What is preserved

- The complete NEXORA V1.1.0 project as supplied in this recovery-ready archive.
- Existing V1.0, V1.0.8 and V1.0.9 baseline snapshots already inside the project.
- The user's OMEGA OVERDRIVE master prompt, copied verbatim to `prompts/OMEGA-OVERDRIVE-MASTER-PROMPT.txt`.
- The user's Live AI Subtitle Engine requirements, copied verbatim to `prompts/LIVE-AI-SUBTITLE-ENGINE-REQUIREMENTS.txt`.
- A structured current state, next action and session log.
- A dependency-free checkpoint utility at `../scripts/nexora_checkpoint.py`.

## Recovery after an interruption

1. Keep this ZIP somewhere outside the active working folder (ideally two locations).
2. If Work disconnects, start a new Work session and attach this ZIP.
3. Send the short instruction in `RESUME-PROMPT.txt`.
4. The next session should read `RECOVERY-STATE.json`, `NEXT-ACTION.md` and `SESSION-LOG.md` before editing anything.
5. It must verify the archive and current source hashes, continue from `next_action`, and must not repeat completed work unless a fresh verification is necessary.
6. After each meaningful phase, create a checkpoint with `python3 scripts/nexora_checkpoint.py --label "phase-name"` and update the state/log files.

## Checkpoint utility

From the extracted project root:

```bash
python3 scripts/nexora_checkpoint.py --label "after-phase-01"
```

The script creates a timestamped ZIP in a sibling `NEXORA-checkpoints` directory, excludes media libraries, dependency folders, VCS internals, caches and environment secrets, writes a SHA-256 manifest, then tests the archive and verifies its manifest.

Verify a checkpoint:

```bash
python3 scripts/nexora_checkpoint.py --verify /path/to/checkpoint.zip
```

The `Entertainment` media folder is intentionally excluded from automated checkpoints. Keep personal media and any required `.env` secrets in a separately secured backup; do not place secrets in a shared or uploaded archive.

## Important limitation

This kit cannot guarantee that ChatGPT Work, the browser, the network or external tools will never disconnect. It protects the project's state and makes continuation possible without reconstructing the entire task from memory.
