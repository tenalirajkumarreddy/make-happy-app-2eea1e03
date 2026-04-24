import json, re
html = open('graphify-out/graph.html').read()

start = html.find('RAW_NODES = [') + len('RAW_NODES = [')
end = html.find('];', start)
raw_section = html[start:end]

ids = re.findall(r'"id":', raw_section)
print('RAW_NODES count:', len(ids))

start2 = html.find('RAW_EDGES = [') + len('RAW_EDGES = [')
end2 = html.find('];', start2)
raw_section2 = html[start2:end2]
edges = re.findall(r'"from":', raw_section2)
print('RAW_EDGES count:', len(edges))