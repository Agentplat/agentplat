"""Pinned inputs and the predeclared, paired schedule. No model calls."""
import hashlib
import json
import random
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '69671fbaac6d67a7ef0dfec016cc38a64ef7a77c'
MODEL = 'claude-sonnet-4-6'
CLAUDE_VERSION = '2.1.236'
TASKS = ('financial-document-processor', 'multi-source-data-merger')
PILOT = 'log-summary-date-ranges'
ARMS = ('agentplat', 'agent-teams')
SEED = 20260910
IMAGES = {
    TASKS[0]: ('alexgshaw/financial-document-processor:20251031',
               'sha256:ef6c9cfaaf14cdd200163008a188d5baa9f626f3bfb8d3e7d6f30c08518e6251'),
    TASKS[1]: ('alexgshaw/multi-source-data-merger:20251031',
               'sha256:8b32782078ff7383a1b4e5d3cecca8ce287e30f50bb4c0e5db009a18064e666e'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def schedule():
    blocks = [(task, rep) for task in TASKS for rep in range(1, 4)]
    random.Random(SEED).shuffle(blocks)
    return [dict(slot_id=f'{task}--r{rep}--{arm}', block=i + 1,
                 task=task, repetition=rep, arm=arm, position=pos + 1)
            for i, (task, rep) in enumerate(blocks)
            for pos, arm in enumerate(ARMS if i % 2 == 0 else ARMS[::-1])]


def verify_files(root, files):
    root = Path(root).resolve()
    for name, meta in files.items():
        target = root / name
        if (Path(name).is_absolute() or '..' in Path(name).parts
                or any(p.is_symlink() for p in [target, *target.parents])
                or not target.is_file() or not target.resolve().is_relative_to(root)
                or digest(target.read_bytes()) != meta['sha256']):
            raise ValueError(f'Unverified file: {name}')


def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read()


def prepare():
    """Download only the frozen official files; never execute their solutions."""
    lock = json.loads((ROOT / 'benchmark.lock.json').read_text())
    cache = ROOT / '.cache/tasks'
    def download(item):
        name, meta = item
        target = cache / name
        if target.is_file() and digest(target.read_bytes()) == meta['sha256']:
            return
        data = fetch(f'https://raw.githubusercontent.com/harbor-framework/terminal-bench-2/{COMMIT}/{name}')
        if digest(data) != meta['sha256']:
            raise ValueError(f'Upstream hash mismatch: {name}')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(int(meta['mode'], 8) & 0o777)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(download, lock['files'].items()))
    verify_files(cache, lock['files'])
    return cache
