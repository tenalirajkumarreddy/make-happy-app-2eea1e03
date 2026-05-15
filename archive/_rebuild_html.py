import json
import re
from collections import defaultdict

with open('src/graphify-out/graph.json') as f:
    g = json.load(f)

nodes = g['nodes']
links = g['links']

# Assign colors
colors = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"]
communities = defaultdict(list)
for n in nodes:
    communities[n.get('community', 0)].append(n['id'])
    
for n in nodes:
    cid = n.get('community', 0)
    n['color'] = colors[cid % len(colors)]
    n['degree'] = 0
    
# Compute real degrees and edges
edge_set = set()
for e in links:
    src, tgt = e['source'], e['target']
    edge_set.add((src, tgt))
    for nid in [src, tgt]:
        for n in nodes:
            if n['id'] == nid:
                n['degree'] += 1
                break

# Build HTML
html = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>graphify - knowledge graph</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; height: 100vh; overflow: hidden; }
#graph { flex: 1; }
#sidebar { width: 280px; background: #1a1a2e; border-left: 1px solid #2a2a4e; display: flex; flex-direction: column; overflow: hidden; }
#search-wrap { padding: 12px; border-bottom: 1px solid #2a2a4e; }
#search { width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 13px; outline: none; }
#search:focus { border-color: #4E79A7; }
#search-results { max-height: 140px; overflow-y: auto; padding: 4px 12px; border-bottom: 1px solid #2a2a4e; display: none; }
.search-item { padding: 4px 6px; cursor: pointer; border-radius: 4px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.search-item:hover { background: #2a2a4e; }
#info-panel { padding: 14px; border-bottom: 1px solid #2a2a4e; min-height: 140px; }
#info-panel h3 { font-size: 13px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
#info-content { font-size: 13px; color: #ccc; line-height: 1.6; }
#info-content .field { margin-bottom: 5px; }
#info-content .field b { color: #e0e0e0; }
#info-content .empty { color: #555; font-style: italic; }
.neighbor-link { display: block; padding: 2px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid #333; }
.neighbor-link:hover { background: #2a2a4e; }
#neighbors-list { max-height: 160px; overflow-y: auto; margin-top: 4px; }
#legend-wrap { flex: 1; overflow-y: auto; padding: 12px; }
#legend-wrap h3 { font-size: 13px; color: #aaa; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; border-radius: 4px; font-size: 12px; }
.legend-item:hover { background: #2a2a4e; padding-left: 4px; }
.legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.legend-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legend-count { color: #666; font-size: 11px; }
#stats { padding: 10px 14px; border-top: 1px solid #2a2a4e; font-size: 11px; color: #555; }
</style>
</head>
<body>
<div id="graph"></div>
<div id="sidebar">
<div id="search-wrap">
<input id="search" type="text" placeholder="Search nodes..." autocomplete="off">
<div id="search-results"></div>
</div>
<div id="info-panel">
<h3>Node Info</h3>
<div id="info-content"><span class="empty">Click a node to inspect it</span></div>
</div>
<div id="legend-wrap">
<h3>Communities</h3>
<div id="legend"></div>
</div>
<div id="stats"></div>
</div>
</div>
<script>
'''

# Build node data
vis_nodes = []
for n in nodes:
    c = n.get('color', '#4E79A7')
    vis_nodes.append({
        'id': n['id'],
        'label': n.get('label', n['id']),
        'color': {'background': c, 'border': c, 'highlight': {'background': '#ffffff', 'border': c}},
        'size': 10 + n.get('degree', 0) * 2,
        'font': {'size': 10, 'color': '#ffffff'},
        'title': n.get('label', n['id']),
        '_community': n.get('community', 0),
        '_source_file': n.get('source_file', ''),
        '_file_type': n.get('file_type', 'code'),
        '_degree': n.get('degree', 0)
    })

# Build edge data
vis_edges = []
for i, e in enumerate(links):
    vis_edges.append({
        'id': i,
        'from': e['source'],
        'to': e['target'],
        'title': e.get('relation', 'relates'),
        'width': 2,
        'color': {'opacity': 0.7}
    })

# Build legend
legend = []
for cid in sorted(communities.keys())[:20]:
    legend.append({'cid': cid, 'color': colors[cid % len(colors)], 'label': f'Community {cid}', 'count': len(communities[cid])})

html += f'''const RAW_NODES = {json.dumps(vis_nodes)};
const RAW_EDGES = {json.dumps(vis_edges)};
const LEGEND = {json.dumps(legend)};

function esc(s) {{
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}}

const nodesDS = new vis.DataSet(RAW_NODES.map(n => ({{
  id: n.id, label: n.label, color: n.color, size: n.size,
  font: n.font, title: n.title,
  _community: n._community, _source_file: n._source_file, _file_type: n._file_type, _degree: n._degree,
}})));

const edgesDS = new vis.DataSet(RAW_EDGES.map((e, i) => ({{
  id: i, from: e.from, to: e.to,
  title: e.title, width: e.width, color: e.color,
  arrows: {{ to: {{ enabled: true, scaleFactor: 0.5 }} }},
}})));

const container = document.getElementById('graph');
const network = new vis.Network(container, {{ nodes: nodesDS, edges: edgesDS }}, {{
  physics: {{ stabilization: {{ iterations: 200 }} }},
  interaction: {{ hover: true, tooltipDelay: 100, hideEdgesOnDrag: true, navigationButtons: false, keyboard: false }},
  nodes: {{ shape: 'dot', borderWidth: 1.5 }},
  edges: {{ smooth: {{ type: 'continuous', roundness: 0.2 }}, selectionWidth: 3 }},
}});

network.once('stabilizationIterationsDone', () => {{
  network.setOptions({{ physics: {{ enabled: false }} }});
}});

function showInfo(nodeId) {{
  const n = nodesDS.get(nodeId);
  if (!n) return;
  const neighborIds = network.getConnectedNodes(nodeId);
  const neighborItems = neighborIds.map(nid => {{
    const nb = nodesDS.get(nid);
    const color = nb ? nb.color.background : '#555';
    return `<span class="neighbor-link" style="border-left-color:${{esc(color)}}" onclick="focusNode(${{JSON.stringify(nid)}})">${{esc(nb ? nb.label : nid)}}</span>`;
  }}).join('');
  document.getElementById('info-content').innerHTML = `
    <div class="field"><b>${{esc(n.label)}}</b></div>
    <div class="field">Type: ${{esc(n._file_type || 'unknown')}}</div>
    <div class="field">Community: ${{n._community}}</div>
    <div class="field">Source: ${{esc(n._source_file || '-')}}</div>
    <div class="field">Degree: ${{n._degree}}</div>
    ${{neighborIds.length ? `<div class="field" style="margin-top:8px;color:#aaa;font-size:11px">Neighbors (${{neighborIds.length}})</div><div id="neighbors-list">${{neighborItems}}</div>` : ''}}
  `;
}}

function focusNode(nodeId) {{
  network.focus(nodeId, {{ scale: 1.4, animation: true }});
  network.selectNodes([nodeId]);
  showInfo(nodeId);
}}

let hoveredNodeId = null;
network.on('hoverNode', params => {{
  hoveredNodeId = params.node;
  showInfo(hoveredNodeId);
  network.selectNodes([hoveredNodeId]);
}});
network.on('click', params => {{
  if (params.nodes.length > 0) {{
    showInfo(params.nodes[0]);
  }} else if (hoveredNodeId === null) {{
    document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect it</span>';
  }}
}});

const searchInput = document.getElementById('search');
const searchResults = document.getElementById('search-results');
searchInput.addEventListener('input', () => {{
  const q = searchInput.value.toLowerCase().trim();
  searchResults.innerHTML = '';
  if (!q) {{ searchResults.style.display = 'none'; return; }}
  const matches = RAW_NODES.filter(n => n.label.toLowerCase().includes(q)).slice(0, 20);
  if (!matches.length) {{ searchResults.style.display = 'none'; return; }}
  searchResults.style.display = 'block';
  matches.forEach(n => {{
    const el = document.createElement('div');
    el.className = 'search-item';
    el.textContent = n.label;
    el.style.borderLeft = `3px solid ${{n.color.background}}`;
    el.style.paddingLeft = '8px';
    el.onclick = () => {{
      network.focus(n.id, {{ scale: 1.5, animation: true }});
      network.selectNodes([n.id]);
      showInfo(n.id);
      searchResults.style.display = 'none';
      searchInput.value = '';
    }};
    searchResults.appendChild(el);
  }});
}});
document.addEventListener('click', e => {{
  if (!searchResults.contains(e.target) && e.target !== searchInput)
    searchResults.style.display = 'none';
}});

const hiddenCommunities = new Set();
const legendEl = document.getElementById('legend');
LEGEND.forEach(c => {{
  const item = document.createElement('div');
  item.className = 'legend-item';
  item.innerHTML = `<div class="legend-dot" style="background:${{c.color}}"></div><span class="legend-label">${{c.label}}</span><span class="legend-count">${{c.count}}</span>`;
  item.onclick = () => {{
    const ids = RAW_NODES.filter(n => n._community === c.cid).map(n => n.id);
    network.selectNodes(ids);
    network.focus({{ nodes: ids, scale: 0.8 }});
  }};
  legendEl.appendChild(item);
}});

document.getElementById('stats').textContent = `${{RAW_NODES.length}} nodes, ${{RAW_EDGES.length}} edges`;
</script>
</body>
</html>'''

with open('graphify-out/graph.html', 'w', encoding='utf-8') as f:
    f.write(html)
    
print(f'Written: {len(nodes)} nodes, {len(links)} edges')