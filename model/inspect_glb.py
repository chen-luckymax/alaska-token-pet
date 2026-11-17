import json,struct,sys
p=sys.argv[1]
d=open(p,'rb').read()
magic,ver,length=struct.unpack_from('<III',d,0)
off=12
chunks=[]
while off<length:
    clen,ct=struct.unpack_from('<II',d,off); off+=8
    chunks.append((ct,clen,d[off:off+clen])); off+=clen
js=json.loads(chunks[0][2].decode('utf-8'))
print('meshes',len(js.get('meshes',[])),'nodes',len(js.get('nodes',[])),'skins',len(js.get('skins',[])),'animations',len(js.get('animations',[])))
print('anim_names', [a.get('name') for a in js.get('animations',[])])
for m in js.get('meshes',[]):
    for pr in m.get('primitives',[]):
        print('mesh',m.get('name'),'attrs',sorted(pr.get('attributes',{}).keys()),'mat',pr.get('material'))
print('materials',[(m.get('name'),m.get('pbrMetallicRoughness',{}).get('baseColorFactor')) for m in js.get('materials',[])])