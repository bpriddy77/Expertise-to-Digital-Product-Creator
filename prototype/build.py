"""
Bundles the map prototype into one self-contained HTML page (for review as a published page).
The source stays modular in src/ so the full app can import the same model, example and view.
Usage: python3 build.py  ->  dist/opportunity-map.html  (+ dist/preview.html, a full HTML document for local testing)
"""
import re, pathlib

root = pathlib.Path(__file__).parent
src = root / 'src'
dist = root / 'dist'
dist.mkdir(exist_ok=True)

def strip_modules(code):
    code = re.sub(r'^import .*?;\s*$', '', code, flags=re.M)
    code = re.sub(r'^export \{[^}]*\};?\s*$', '', code, flags=re.M)
    return re.sub(r'^export (const|function|class|let) ', r'\1 ', code, flags=re.M)

js = '\n'.join(strip_modules((src / f).read_text()) for f in ['map-model.js', 'example-website-designer.js', 'examples.js', 'map-view.js'])
css = (src / 'map.css').read_text()
page = (src / 'index.html').read_text().replace('/*CSS*/', css).replace('/*JS*/', js)
(dist / 'opportunity-map.html').write_text(page)
(dist / 'preview.html').write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + page + '</body></html>')
print('built', len(page), 'bytes')
