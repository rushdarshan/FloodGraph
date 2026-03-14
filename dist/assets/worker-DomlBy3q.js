const c="https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";let r=null,a=null;function d(o,e){self.postMessage({id:"__status__",ok:!0,result:{status:e,message:o}})}async function u(){if(r)return;d("Loading Pyodide runtime…","loading"),r=await(await import(`${c}pyodide.mjs`)).loadPyodide({indexURL:c}),d("Installing numpy + networkx…","loading"),await r.loadPackage(["numpy","networkx"]),await r.runPythonAsync(`
import networkx as nx
import numpy as np
print("NeerNet Pyodide ready: networkx", nx.__version__, "numpy", np.__version__)
  `),d("Pyodide ready","ready")}function f(){return a||(a=u()),a}async function _(o){const{edges:e}=o,s=JSON.stringify(e),t=await r.runPythonAsync(`
import json, networkx as nx
edges_raw = json.loads('''${s.replace(/'/g,"\\'")}''')
G = nx.Graph()
for e in edges_raw:
    G.add_edge(e['source'], e['target'])

comps = list(nx.connected_components(G))
comps_sorted = sorted(comps, key=len, reverse=True)

json.dumps({
    "num_components": len(comps_sorted),
    "component_sizes": [len(c) for c in comps_sorted],
    "components": [list(c) for c in comps_sorted]
})
  `);return JSON.parse(t)}async function y(o){const{edges:e,source_nodes:s,steps:t}=o,n=JSON.stringify(e),i=JSON.stringify(s),p=Number.isFinite(t)?Math.max(1,Math.min(t,50)):5,l=await r.runPythonAsync(`
import json, collections, networkx as nx

edges_raw    = json.loads('''${n.replace(/'/g,"\\'")}''')
source_nodes = json.loads('''${i.replace(/'/g,"\\'")}''')
max_steps    = ${p}

G = nx.Graph()
for e in edges_raw:
    G.add_edge(e['source'], e['target'])

# BFS flood propagation
flooded  = set(source_nodes)
frontier = list(source_nodes)
steps_done = 0

for _ in range(max_steps):
    if not frontier:
        break
    next_frontier = []
    for node in frontier:
        for nb in G.neighbors(node):
            if nb not in flooded:
                flooded.add(nb)
                next_frontier.append(nb)
    frontier = next_frontier
    steps_done += 1

json.dumps({
    "flooded_nodes": list(flooded),
    "steps_taken":   steps_done
})
  `);return JSON.parse(l)}self.onmessage=async o=>{const{id:e,type:s,payload:t}=o.data;if(s==="ping"){self.postMessage({id:e,ok:!0,result:"pong"});return}try{await f();let n;switch(s){case"connectivity":n=await _(t);break;case"toy_flood":n=await y(t);break;default:{const i=s;throw new Error(`Unknown job type: ${i}`)}}self.postMessage({id:e,ok:!0,result:n})}catch(n){const i=n instanceof Error?n.message:String(n);self.postMessage({id:e,ok:!1,error:i})}};
