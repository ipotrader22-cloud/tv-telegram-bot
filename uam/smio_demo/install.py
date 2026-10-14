"""Install only the reviewed UAM delta; preserve settings, sessions and ledgers."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent


def patch_text(original, patch):
    lines, result, cursor = original.splitlines(True), [], 0
    diff = patch.splitlines(True)
    index = 0
    while index < len(diff):
        match = re.match(r"@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@", diff[index])
        if not match:
            index += 1
            continue
        start = int(match[1]) - 1
        if start < cursor:
            raise ValueError("overlapping patch")
        result.extend(lines[cursor:start])
        cursor = start
        index += 1
        while index < len(diff) and not diff[index].startswith("@@"):
            line = diff[index]
            if line.startswith((" ", "-")):
                if cursor >= len(lines) or lines[cursor] != line[1:]:
                    raise ValueError("source context changed; no files installed")
                if line.startswith(" "):
                    result.append(lines[cursor])
                cursor += 1
            elif line.startswith("+"):
                result.append(line[1:])
            index += 1
    result.extend(lines[cursor:])
    return "".join(result)


def install(target, check_only=False):
    target = Path(target).resolve(strict=True)
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    pine = target / manifest["pine"]["path"]
    if hashlib.sha256(pine.read_bytes()).hexdigest() != manifest["pine"]["sha256"]:
        raise ValueError("installed Pine differs from reviewed v0.1")
    changes = {}
    for relative, spec in manifest["patches"].items():
        original = (target / relative).read_bytes()
        if hashlib.sha256(original).hexdigest() != spec["sha256"]:
            raise ValueError(f"{relative} changed since inspection; refusing overwrite")
        text = patch_text(original.decode("utf-8").replace("\r\n", "\n"), (ROOT / spec["patch"]).read_text(encoding="utf-8"))
        compile(text, relative, "exec")
        changes[relative] = text.encode("utf-8")
    for relative in manifest["copies"]:
        content = (ROOT / relative).read_bytes()
        if relative.endswith(".py"):
            compile(content, relative, "exec")
        existing = target / relative
        if existing.exists() and existing.read_bytes() != content:
            raise ValueError(f"existing {relative} differs; refusing overwrite")
        changes[relative] = content
    if check_only:
        print("UAM source/Pine preflight PASS; no files changed")
        return
    backup = target / "SMIO_RSI_install_backups" / datetime.now().strftime("demo-%Y%m%d-%H%M%S")
    backup.mkdir(parents=True, exist_ok=False)
    previous = {}
    try:
        for relative, content in changes.items():
            dest = target / relative
            previous[relative] = dest.read_bytes() if dest.exists() else None
            if dest.exists():
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dest, saved)
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(dest.suffix + ".smio-tmp")
            tmp.write_bytes(content)
            os.replace(tmp, dest)
    except Exception:
        for relative, content in previous.items():
            dest = target / relative
            if content is not None:
                dest.write_bytes(content)
            elif dest.exists():
                dest.unlink()
        raise
    (backup / "installation.json").write_text(json.dumps({"files": list(changes), "contract": manifest["experimental_contract"]}, indent=2), encoding="utf-8")
    print("Installed UAM experimental SMIO_RSI profile; backup:", backup)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    install(args.target, args.check_only)
