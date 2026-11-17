import json,struct,sys
p=sys.argv[1]
d=open(p,'rb').read(); off=12; chunks=[]
while off<len(d):
    clen,ct=struct.unpack_from("<II",d,off); off+=8; chunks.append((ct,d[off:off+clen])); off+=clen
js=json.loads(chunks[0][1].decode("utf-8"))
for a in js.get("animations",[]):
    # duration from accessor max input
    inputs=[js["accessors"][s["input"]].get("max",[0])[0] for s in a["samplers"]]
    print(a.get("name"), "dur", max(inputs) if inputs else None, "channels", len(a["channels"]))
print("nodes", [n.get("name") for n in js["nodes"] if n.get("name") in ("root","hips","head","eye.L","eye.R","mouth")])