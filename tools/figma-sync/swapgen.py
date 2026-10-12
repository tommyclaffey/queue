# swapgen.py <page> <mode> <pre-desktop> <pre-mobile> <batch-index> <batch-size> → prints a use_figma script that builds + swaps a batch
import json, sys
page, mode, pd, pm, bi, bs = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
nodes = json.load(open('/tmp/qfig/up/nodes.json'))
jobs = [j for j in json.load(open('/tmp/qfig/njobs.json')) if j[0] in (pd, pm)]
batch = jobs[bi*bs:(bi+1)*bs]
J = [[nodes[f'N-{p}-{s}'], m, c] for p, s, c, m in batch]
print(f"const PAGE = '{page}', MODE = '{mode}', BUILDER = '{nodes['builder4']}';\nconst JOBS = {json.dumps(J)};")
print(open('/tmp/qfig/swapbody.js').read())
print(f"// batch {bi} of {(len(jobs)+bs-1)//bs}, {len(batch)} jobs", file=sys.stderr)
