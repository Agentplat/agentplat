#!/usr/bin/env python3
"""Build a checksummed companion overlay for the source checkout named in the paper."""
from pathlib import Path
from hashlib import sha256
import json
import zipfile
import sys

root = Path(__file__).resolve().parents[2]
version = sys.argv[1] if len(sys.argv)>1 else 'v0.2'
assert version in ('v0.2','v0.3','v0.4')
dest = root / f'output/agent-morphogenesis-{version}-artifact.zip'
paths = []
folders = ['docs/research/morphogenesis-paper-v0.2', 'experiments/morphogenesis-paper']
if version != 'v0.2': folders.append('docs/research/morphogenesis-paper-v0.3')
if version == 'v0.4': folders.append('docs/research/morphogenesis-paper-v0.4')
for folder in folders:
    paths.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
paths.append(root/f'output/pdf/agent-morphogenesis-paper-{version}.pdf')
manifest = [{'path': str(p.relative_to(root)), 'sha256': sha256(p.read_bytes()).hexdigest()}
            for p in sorted(paths)]
readme = f'''Agent Morphogenesis {version} companion artifact

This ZIP is an overlay, not the full AgentPlat repository or its dependencies.
Use an AgentPlat checkout at e978544915a329387e13883fa352191f6993dcc7 and
extract this overlay into that checkout. The original v0.1 files are not included
or overwritten. See docs/research/morphogenesis-paper-{version}/README.md for commands.

The retained boundary pilot has eleven prescribed cases using synthetic owners. It is
not a confirmatory utility benchmark or a production qualification. The
development-attempts directory preserves failed and intermediate attempts.
Version v0.3 also includes a separate local PostgreSQL Team/Work integration pilot.
Version v0.4 adds a frozen 1,536-run finite-grid comparison and its independent
exact-arithmetic/dependency oracle. It does not demonstrate LLM utility or
production performance. All three evidence classes remain distinct.

SHA256SUMS.json binds every overlaid file, including the PDF, figures, runner,
verifier, raw evidence and attempt history. These hashes detect changes; they
are not an authenticated signature or independent replication.

Rendering the PDF requires reportlab and the documented TTF fonts. Verifying
the retained evidence requires the built AgentPlat modules but no live services.
'''
with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(paths): z.write(p,str(p.relative_to(root)))
    z.writestr('ARTIFACT-README.txt',readme)
    z.writestr('SHA256SUMS.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(dest) as z:
    assert z.testzip() is None
    for entry in json.loads(z.read('SHA256SUMS.json')):
        assert sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
print(f'{dest} ({dest.stat().st_size} bytes; {len(paths)} verified files)')
