import re
html = open('graphify-out/graph.html').read()
m = re.search(r'RAW_NODES = \[', html)
if m:
    start = m.end()
    depth = 1
    i = start
    while i < len(html) and depth > 0:
        if html[i] == '[': depth += 1
        elif html[i] == ']': depth -= 1
        i += 1
    json_str = html[start:i-1]
    ids = re.findall(r'"id":"([^"]+)"', json_str)
    print('RAW_NODES count:', len(ids))
    
    # Also check edges
    m2 = re.search(r'const RAW_EDGES = \[', html)
    if m2:
        start2 = m2.end()
        depth2 = 1
        j = start2
        while j < len(html) and depth2 > 0:
            if html[j] == '[': depth2 += 1
            elif html[j] == ']': depth2 -= 1
            j += 1
        json_str2 = html[start2:j-1]
        edges = re.findall(r'"from":"([^"]+)","to":"([^"]+)"', json_str2)
        print('RAW_EDGES count:', len(edges))