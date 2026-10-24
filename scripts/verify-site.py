"""Prüft die vollständige Pages-Ausgabe und erzeugt ihren GitHub-Quellnachweis."""
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
ALLOWED = {
    '.nojekyll', 'CNAME', 'index.html', 'entry.css', 'entry.js', 'sw.js',
    '_v/update.html', 'anbieter/index.html', 'impressum/index.html',
    'datenschutz/index.html', 'dienst-datenschutz/index.html',
    'brand/favicon-32.png', 'brand/favicon-48.png', 'brand/kundenzettel-mark.png',
}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []

    def handle_starttag(self, tag, attrs):
        self.targets.extend(value for key, value in attrs if key in {'href', 'src'} and value)


def verify():
    actual = {p.relative_to(SITE).as_posix() for p in SITE.rglob('*') if p.is_file()}
    assert actual - {'release.json'} == ALLOWED, f'Unerwartete/fehlende Dateien: {actual ^ ALLOWED}'
    assert not subprocess.check_output(['git', 'ls-files', 'portal'], cwd=ROOT, text=True).strip(), 'Alter Portalquellcode ist noch versioniert'
    assert (SITE / 'CNAME').read_text().strip() == 'kundenzettel.de'
    for name in sorted(ALLOWED):
        if Path(name).suffix not in {'.html', '.js', '.css'}:
            continue
        text = (SITE / name).read_text(encoding='utf-8')
        assert not re.search(r'Marie|Köbbler|Kranz|LandingPage|gitlab\.(?:com|io)|/assets/', text, re.I), name
        if name.endswith('.html'):
            links = Links()
            links.feed(text)
            for target in links.targets:
                url = urlsplit(target)
                if not url.scheme and url.path.startswith('/'):
                    path = SITE / unquote(url.path).lstrip('/')
                    if path.is_dir():
                        path /= 'index.html'
                    assert path.is_file(), f'{name}: fehlendes Linkziel {target}'
    source_commit = os.environ.get('GITHUB_SHA') or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    release = {
        'schemaVersion': 1,
        'sourceRepository': 'https://github.com/mat-ai-sch/kundenzettel-website',
        'sourceCommit': source_commit,
        'mode': 'entry-redirect-and-legal',
        'hostname': 'kundenzettel.de',
        'destination': 'https://demo.kundenzettel.de/#/gespraeche',
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'files': [{'path': name, 'sha256': sha256((SITE / name).read_bytes()).hexdigest()} for name in sorted(ALLOWED)],
    }
    (SITE / 'release.json').write_text(json.dumps(release, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'PASS: {len(ALLOWED)} erlaubte Dateien; alte Landingpage und Portalquellen entfernt; interne Links vollständig.')


if __name__ == '__main__':
    verify()
