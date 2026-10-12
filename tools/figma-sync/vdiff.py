import json, sys
from PIL import Image, ImageChops
out = []
for pre, sj in [('L', 'screens-L.json'), ('K', 'screens-L.json'), ('ML', 'screens-M.json'), ('MK', 'screens-M.json')]:
    for sid, name, _ in json.load(open(f'/tmp/qfig/{sj}')):
        a, b = f'/tmp/qfig/cap/{pre}-{sid}.png', f'/tmp/qfig/cap/V-{pre}-{sid}.png'
        try:
            A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        except Exception as e:
            out.append((pre, sid, name, 'MISSING', str(e)[:60])); continue
        if A.size != B.size:
            out.append((pre, sid, name, 'SIZE', f'{A.size} vs {B.size}')); continue
        d = ImageChops.difference(A, B).convert('L').point(lambda v: 255 if v > 24 else 0)
        n = sum(d.histogram()[255:]); box = d.getbbox()
        pct = 100 * n / (A.size[0] * A.size[1])
        out.append((pre, sid, name, f'{pct:.2f}%', str(box)))
for r in out: print(*r, sep=' | ')
