# Capture every mockup: 12 main screens + 2 drill-downs x 4 devices x 2 themes
import json, subprocess, sys, os
STAMP = os.environ.get('STAMP')
L = {r[0]: r for r in json.load(open('/tmp/qfig/screens-L.json'))}
M = {r[0]: r for r in json.load(open('/tmp/qfig/screens-M.json'))}
SCREENS = [  # name, desktop id, phone id
  ('Dashboard', '03', '03'), ('Calendar · Month', '04', '04'), ('Calendar · Week', '05', '25'),
  ('New post · Video', '07', '07'), ('New post · Carousel', '08', '08'), ('New post · Story', '09', '09'),
  ('Queue', '11', '11'), ('Post detail', '12', '12'), ('Library', '14', '14'), ('Quality Lab', '15', '15'),
  ('Accounts', '16', '16'), ('Settings', '17', '17'),
  # drill-downs (rule Oct 14): the list at its best section + one item's detail page
  ('Queue · Posted', "js:location.hash='#/queue'; await w(700); queueTab='posted'; render(); await w(1500); await Promise.all([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.complete && i.naturalWidth ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); }))); await w(800);", "js:location.hash='#/queue'; await w(700); queueTab='posted'; render(); await w(1500); await Promise.all([...document.images].filter(i => i.getBoundingClientRect().top < innerHeight).map(i => i.complete && i.naturalWidth ? 0 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); }))); await w(800);"), ('Post detail · Posted', '22', '22')]
# Rule (Oct 14): the 1440 design at the device's exact pixels. Width 1440, density = export width / 1440, never reflowed.
DEV = [('iPhone', 402, 786, 3, 1), ('Laptop 13', 1440, 1664 * 1440 / 2560, 2560 / 1440, 0), ('Laptop 16', 1440, 931, 2.4, 0), ('Desktop', 1440, 2880 * 1440 / 5120, 5120 / 1440, 0)]
only = sys.argv[1] if len(sys.argv) > 1 else None
for dev, w, h, dsf, mob in DEV:
  if only and dev != only: continue
  for theme in ('light', 'dark'):
    for i, (name, did, pid) in enumerate(SCREENS):
      ref = pid if mob else did
      js = ref[3:] if ref.startswith('js:') else (M[pid] if mob else L[did])[2]
      base = 'http://localhost:4403' if mob else 'http://localhost:4402'
      out = f"/tmp/qfig/mock/{dev.replace(' ', '')}-{theme}-{i:02d}.png"
      if STAMP and os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(STAMP): continue
      subprocess.run(['node', '/tmp/qfig/mockshot.mjs', base, out, str(w), repr(h), repr(dsf), theme, js] + (['1'] if mob else []), timeout=120)
