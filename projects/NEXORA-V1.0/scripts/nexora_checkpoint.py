#!/usr/bin/env python3
"""Create or verify a resumable, SHA-256-manifested NEXORA source checkpoint.

No third-party packages are required. Run from any directory:
  python3 scripts/nexora_checkpoint.py --label after-phase-01
  python3 scripts/nexora_checkpoint.py --verify /path/to/checkpoint.zip

By default the checkpoint is written beside the project, not inside it.
Media libraries, dependency trees, VCS internals, caches, logs and environment
secrets are intentionally excluded. Back up those separately and securely.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", ".venv", "venv",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".cache", "coverage", "dist", "build", "tmp", "temp", "logs",
    "Entertainment",
}
EXCLUDED_FILES = {".DS_Store", "Thumbs.db"}
EXCLUDED_SUFFIXES = {".log", ".tmp", ".swp", ".swo"}
MANIFEST_NAME = "WORK-RECOVERY/CHECKPOINT-MANIFEST.sha256"
INFO_NAME = "WORK-RECOVERY/CHECKPOINT-INFO.json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_secret_env_file(name: str) -> bool:
    if name in {".env.example", ".env.sample", ".env.template"}:
        return False
    return name == ".env" or name.startswith(".env.")


def should_exclude(path: Path, rel: Path, output_dir: Path | None) -> bool:
    if any(part in EXCLUDED_DIRS for part in rel.parts):
        return True
    if path.name in EXCLUDED_FILES or is_secret_env_file(path.name):
        return True
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    if path.is_symlink():
        return True
    if output_dir is not None:
        try:
            path.resolve().relative_to(output_dir.resolve())
            return True
        except ValueError:
            pass
    if rel.as_posix() == MANIFEST_NAME or rel.as_posix() == INFO_NAME:
        return True
    return False


def iter_project_files(output_dir: Path | None) -> Iterable[tuple[Path, str]]:
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if should_exclude(path, rel, output_dir):
            continue
        yield path, rel.as_posix()


def build_checkpoint(label: str, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    safe_label = re.sub(r"[^A-Za-z0-9_-]+", "-", label).strip("-_")[:48] or "checkpoint"
    archive = output_dir / f"NEXORA-{safe_label}-{stamp}.zip"
    temporary = archive.with_suffix(".zip.tmp")

    payloads: list[tuple[str, bytes]] = []
    for source, rel in iter_project_files(output_dir):
        payloads.append((rel, source.read_bytes()))

    if not payloads:
        raise RuntimeError("No project files were found; refusing to create an empty checkpoint.")

    info = {
        "format": 1,
        "project": "NEXORA",
        "project_directory": ROOT.name,
        "label": safe_label,
        "created_utc": now.isoformat(),
        "file_count_before_manifest": len(payloads) + 1,
        "excluded": sorted(EXCLUDED_DIRS) + ["secret .env files", "logs and temporary files", "symlinks", "checkpoint output directory"],
        "note": "Media libraries and runtime dependencies are excluded. Keep separate secure backups for personal media and secrets.",
    }
    info_bytes = (json.dumps(info, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    payloads.append((INFO_NAME, info_bytes))

    manifest_lines = [f"{sha256_bytes(data)}  {name}" for name, data in sorted(payloads)]
    manifest_bytes = ("\n".join(manifest_lines) + "\n").encode("utf-8")

    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for name, data in payloads:
                zf.writestr(name, data)
            zf.writestr(MANIFEST_NAME, manifest_bytes)

        verify_archive(temporary, quiet=True)
        os.replace(temporary, archive)
        digest = sha256_bytes(archive.read_bytes())
        sidecar = archive.with_suffix(archive.suffix + ".sha256")
        sidecar.write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
        return archive
    finally:
        if temporary.exists():
            temporary.unlink()


def verify_archive(archive: Path, quiet: bool = False) -> dict:
    archive = archive.expanduser().resolve()
    if not archive.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {archive}")
    with zipfile.ZipFile(archive, "r") as zf:
        bad_member = zf.testzip()
        if bad_member:
            raise RuntimeError(f"ZIP CRC failure in member: {bad_member}")
        try:
            manifest_data = zf.read(MANIFEST_NAME).decode("utf-8")
        except KeyError as exc:
            raise RuntimeError("Checkpoint has no SHA-256 manifest.") from exc

        expected: dict[str, str] = {}
        for line_no, line in enumerate(manifest_data.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                digest, rel = line.split("  ", 1)
            except ValueError as exc:
                raise RuntimeError(f"Malformed manifest line {line_no}.") from exc
            expected[rel] = digest

        actual_names = {name for name in zf.namelist() if name != MANIFEST_NAME}
        if actual_names != set(expected):
            missing = sorted(set(expected) - actual_names)
            extra = sorted(actual_names - set(expected))
            raise RuntimeError(f"Manifest/archive entries differ. Missing={missing}; extra={extra}")

        for rel, expected_digest in expected.items():
            actual_digest = sha256_bytes(zf.read(rel))
            if actual_digest != expected_digest:
                raise RuntimeError(f"SHA-256 mismatch: {rel}")

    result = {
        "archive": str(archive),
        "zip_integrity": "passed",
        "manifest_entries_verified": len(expected),
        "sha256": sha256_bytes(archive.read_bytes()),
        "status": "VERIFIED",
    }
    if not quiet:
        print(json.dumps(result, indent=2))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or verify a NEXORA recovery checkpoint.")
    parser.add_argument("--label", default="work-checkpoint", help="Short checkpoint label")
    parser.add_argument("--output-dir", type=Path, default=ROOT.parent / f"{ROOT.name}-checkpoints")
    parser.add_argument("--verify", type=Path, help="Verify an existing checkpoint ZIP")
    args = parser.parse_args()

    try:
        if args.verify:
            verify_archive(args.verify)
        else:
            archive = build_checkpoint(args.label, args.output_dir)
            result = verify_archive(archive, quiet=True)
            result["sidecar_sha256"] = str(archive.with_suffix(archive.suffix + ".sha256"))
            print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:  # CLI boundary: print a useful error and fail closed.
        print(f"CHECKPOINT ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
