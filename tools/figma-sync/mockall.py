# Capture every mockup: 12 screens x 4 devices x 2 themes
import json, subprocess, sys, os
STAMP = os.environ.get('STAMP')
L = {r[0]: r for r in json.load(open('/tmp/qfig/screens-L.json'))}
M = {r[0]: r for r in json.load(open('/tmp/qfig/screens-M.json'))}
SCREENS = [  # name, desktop id, phone id
  ('Dashboard', '03', '03'), ('Calendar · Month', '04', '04'), ('Calendar · Week', '05', '25'),
  ('New post · Video', '07', '07'), ('New post · Carousel', '08', '08'), ('New post · Story', '09', '09'),
  ('Queue', '11', '11'), ('Post detail', '12', '12'), ('Library', '14', '14'), ('Quality Lab', '15', '15'),
  ('Accounts', '16', '16'), ('Settings', '17', '17')]
DEV = [('iPhone', 402, 786, 3, 1), ('Laptop 13', 1280, 832, 2, 0), ('Laptop 16', 1728, 1117, 2, 0), ('Desktop', 2560, 1440, 2, 0)]
only = sys.argv[1] if len(sys.argv) > 1 else None
for dev, w, h, dsf, mob in DEV:
  if only and dev != only: continue
  for theme in ('light', 'dark'):
    for i, (name, did, pid) in enumerate(SCREENS):
      js = (M[pid] if mob else L[did])[2]
      base = 'http://localhost:4403' if mob else 'http://localhost:4402'
      out = f"/tmp/qfig/mock/{dev.replace(' ', '')}-{theme}-{i:02d}.png"
      if STAMP and os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(STAMP): continue
      subprocess.run(['node', '/tmp/qfig/mockshot.mjs', base, out, str(w), str(h), str(dsf), theme, js] + (['1'] if mob else []), timeout=120)
