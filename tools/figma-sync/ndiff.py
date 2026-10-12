# Which screens differ between the fresh capture (N-*) and what Figma was built from? Prints JSON jobs.
import json, os
from PIL import Image, ImageChops
jobs = []
for pre, sj, mob in [('L', 'screens-L2.json', 0), ('K', 'screens-L2.json', 0), ('ML', 'screens-M2.json', 1), ('MK', 'screens-M2.json', 1)]:
    for sid, name, _ in json.load(open(f'/tmp/qfig/{sj}')):
        new = f'/tmp/qfig/cap/N-{pre}-{sid}.png'; old = f'/tmp/qfig/cap/{pre}-{sid}.png'
        code = name.split(' ')[0]
        if not os.path.exists(new): print('MISSING', new); continue
        changed = True
        # the 3 phone frames that were renumbered still hold the old content source; new slots always build
        if os.path.exists(old):
            A, B = Image.open(old).convert('RGB'), Image.open(new).convert('RGB')
            if A.size == B.size:
                d = ImageChops.difference(A, B).convert('L').point(lambda v: 255 if v > 24 else 0)
                box = d.getbbox()
                # ignore the sidebar "next check 0:0x" countdown
                changed = bool(box) and not (box[0] >= 175 and box[2] <= 195 and box[1] >= 865 and box[3] <= 890)
        if changed: jobs.append([pre, sid, code, mob])
json.dump(jobs, open('/tmp/qfig/njobs.json', 'w'))
from collections import Counter
print(len(jobs), Counter(j[0] for j in jobs)); print(jobs)
