import json
from collections import defaultdict

with open('graphify-out/graph.json') as f:
    g = json.load(f)

# Compute real degrees
adj = defaultdict(int)
for e in g['links']:
    adj[e['source']] += 1
    adj[e['target']] += 1

# Fix nodes degrees
for n in g['nodes']:
    n['degree'] = adj.get(n['id'], 0)

with open('graphify-out/graph.json', 'w') as f:
    json.dump(g, f, indent=2)
    
print('Fixed degrees')
print('Degree 0 nodes:', sum(1 for n in g['nodes'] if n['degree'] == 0))
print('Non-zero:', sum(1 for n in g['nodes'] if n['degree'] > 0))