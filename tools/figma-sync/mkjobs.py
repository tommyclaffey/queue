import json
from PIL import Image
iph = ["181:351","181:610","181:858","181:1177","181:1495","181:1741","181:2174","181:2321","181:2511","181:2754","181:2988","181:3174","181:3458","181:3718","181:3967","181:4287","181:4606","181:4853","181:5287","181:5435","181:5626","181:5870","181:6105","181:6292"]
halves = [("231:%d" % (42490 + 2*i), "231:%d" % (42491 + 2*i)) for i in range(24)]
jobs = []
for t_i, theme in enumerate(('light', 'dark')):
    for i in range(12):
        k = t_i * 12 + i
        jobs.append({'file': f'mock/iPhone-{theme}-{i:02d}.png', 'node': iph[k]})
        jobs.append({'file': f'mock/Laptop13-{theme}-{i:02d}.png', 'node': '181:%d' % ((22582 if theme == 'light' else 22595) + i)})
        jobs.append({'file': f'mock/Laptop16-{theme}-{i:02d}.png', 'node': '181:%d' % ((22609 if theme == 'light' else 22622) + i)})
        src = Image.open(f'/tmp/qfig/mock/Desktop-{theme}-{i:02d}.png'); W, H = src.size
        for side, node, box in (('L', halves[k][0], (0, 0, W // 2, H)), ('R', halves[k][1], (W // 2, 0, W, H))):
            out = f'mock/Desktop-{theme}-{i:02d}-{side}.png'; src.crop(box).save('/tmp/qfig/' + out)
            jobs.append({'file': out, 'node': node})
json.dump(jobs, open('/tmp/qfig/mock/jobs-all.json', 'w'))
json.dump(jobs[:60], open('/tmp/qfig/mock/jobs-a.json', 'w')); json.dump(jobs[60:], open('/tmp/qfig/mock/jobs-b.json', 'w'))
print(len(jobs)); print(json.dumps([j['node'] for j in jobs[:60]])); print(json.dumps([j['node'] for j in jobs[60:]]))
