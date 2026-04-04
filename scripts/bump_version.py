#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
PROJECT_SECTION_RE = re.compile(r"(?ms)^\[project\]\n(?P<body>.*?)(?=^\[|\Z)")
PROJECT_VERSION_RE = re.compile(r'(?m)^version\s*=\s*"([^"]+)"\s*$')
PACKAGE_JSON_CANDIDATES = ("electron/package.json",)


def parse_semver(version: str) -> tuple[int, int, int]:
    match = SEMVER_RE.fullmatch(version.strip())
    if not match:
        raise ValueError(f"Expected semantic version X.Y.Z, got '{version}'")
    return tuple(int(part) for part in match.groups())


def bump_semver(version: str, bump: str) -> str:
    major, minor, patch = parse_semver(version)
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise ValueError(f"Unsupported bump type: {bump}")


def read_pyproject_version(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    section_match = PROJECT_SECTION_RE.search(text)
    if not section_match:
        raise ValueError(f"Missing [project] section in {path}")
    body = section_match.group("body")
    version_match = PROJECT_VERSION_RE.search(body)
    if not version_match:
        raise ValueError(f"Missing version in [project] section of {path}")
    return version_match.group(1)


def write_pyproject_version(path: Path, new_version: str) -> None:
    text = path.read_text(encoding="utf-8")
    section_match = PROJECT_SECTION_RE.search(text)
    if not section_match:
        raise ValueError(f"Missing [project] section in {path}")

    body = section_match.group("body")
    if not PROJECT_VERSION_RE.search(body):
        raise ValueError(f"Missing version in [project] section of {path}")

    new_body = PROJECT_VERSION_RE.sub(f'version = "{new_version}"', body, count=1)
    updated = (
        text[: section_match.start("body")]
        + new_body
        + text[section_match.end("body") :]
    )
    path.write_text(updated, encoding="utf-8")


def read_package_json_version(path: Path) -> str:
    payload = json.loads(path.read_text(encoding="utf-8"))
    version = payload.get("version")
    if not isinstance(version, str):
        raise ValueError(f"Missing string version in {path}")
    return version


def write_package_json_version(path: Path, new_version: str) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "version" not in payload or not isinstance(payload["version"], str):
        raise ValueError(f"Missing string version in {path}")
    payload["version"] = new_version
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bump or set this repository's project version."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--bump",
        choices=["major", "minor", "patch"],
        help="Increment semantic version part",
    )
    mode.add_argument(
        "--set", dest="set_version", metavar="X.Y.Z", help="Set exact semantic version"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without writing files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    pyproject_path = repo_root / "pyproject.toml"

    normalized_set_version = args.set_version.strip() if args.set_version else None
    if normalized_set_version:
        parse_semver(normalized_set_version)

    current_version = read_pyproject_version(pyproject_path)
    target_version = (
        normalized_set_version
        if normalized_set_version
        else bump_semver(current_version, args.bump)
    )

    print("Dry run only." if args.dry_run else "Applying changes.")
    print(f"pyproject.toml: {current_version} -> {target_version}")

    if not args.dry_run and current_version != target_version:
        write_pyproject_version(pyproject_path, target_version)

    for rel_path in PACKAGE_JSON_CANDIDATES:
        package_path = repo_root / rel_path
        if not package_path.exists():
            continue
        package_version = read_package_json_version(package_path)
        print(f"{rel_path}: {package_version} -> {target_version}")
        if not args.dry_run and package_version != target_version:
            write_package_json_version(package_path, target_version)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
