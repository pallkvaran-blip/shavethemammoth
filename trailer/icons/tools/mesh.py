# Builds a constellation icon straight from exact outlines: dots along every outline, dots inside,
# thin lines between them. Sizes are those measured on the chosen shield (2048 px frame).
import cv2, numpy as np
from scipy.spatial import Delaunay, cKDTree
N=2048; SS=3
SP=116                       # spacing of dots along an outline
DOT_EDGE=(31,35); DOT_IN=(24,28)          # dot diameters
LINE_EDGE=(5.6,0.95); LINE_IN=3.4; LEVELS=(0.50,0.58,0.66,0.74)
BG=np.array([251,242,238],np.float32); INK=np.array([56,137,217],np.float32)

def along(P):
    """P: corner points of a closed outline. Returns dots: the corners plus evenly spaced points between them."""
    out=[]
    for i in range(len(P)):
        a,b=P[i],P[(i+1)%len(P)]; n=max(1,int(round(np.linalg.norm(b-a)/SP)))
        out+= [a+(b-a)*k/n for k in range(n)]
    return np.array(out)

def part(outlines, rng, extra_p=0.34, clear=44):
    """outlines: list of closed dot loops (first is the outside, the rest are holes). Returns dots and lines."""
    mask=np.zeros((N,N),np.uint8); cv2.fillPoly(mask,[np.round(outlines[0]).astype(np.int32)],255)
    for h in outlines[1:]: cv2.fillPoly(mask,[np.round(h).astype(np.int32)],0)
    edge=np.vstack(outlines); ne=len(edge); ring=set(); nb={}
    o=0
    for L in outlines:
        for k in range(len(L)):
            i,j=o+k,o+(k+1)%len(L); ring.add((min(i,j),max(i,j))); nb.setdefault(i,[]).append(j); nb.setdefault(j,[]).append(i)
        o+=len(L)
    # dots inside: scattered, kept clear of the outline and of each other
    core=cv2.erode(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*clear+1,2*clear+1)))
    ys,xs=np.where(core>0); inner=[]
    if len(xs):
        for q in rng.permutation(len(xs))[:60000]:
            p=np.array([xs[q],ys[q]],float)
            if all(np.hypot(*(p-r))>=98 for r in inner): inner.append(p)
    pts=np.vstack([edge]+([np.array(inner)] if inner else []))
    near=cv2.dilate(mask,np.ones((9,9),np.uint8))
    def inside(i,j):
        t=np.linspace(0.1,0.9,17)[:,None]; q=np.round(pts[i]+(pts[j]-pts[i])*t).astype(int)
        return bool((near[q[:,1].clip(0,N-1),q[:,0].clip(0,N-1)]>0).all())
    def hugs(i,j):                      # runs almost along the outline: would only thicken it
        for a,b in ((i,j),(j,i)):
            if a<ne:
                d=pts[b]-pts[a]; d/=np.linalg.norm(d)
                for c in nb[a]:
                    e=pts[c]-pts[a]; e/=np.linalg.norm(e)
                    if d@e>np.cos(np.radians(16)): return True
        return False
    lines=set()
    for s in Delaunay(pts).simplices:
        for a,b in ((s[0],s[1]),(s[1],s[2]),(s[0],s[2])):
            k=(min(a,b),max(a,b))
            if k not in ring and np.linalg.norm(pts[a]-pts[b])<2.1*SP and inside(*k) and not hugs(*k): lines.add(k)
    deg=np.zeros(len(pts),int)
    for a,b in lines: deg[a]+=1; deg[b]+=1
    extra=sorted(cKDTree(pts).query_pairs(1.55*SP))
    for q in rng.permutation(len(extra)):
        k=extra[q]
        if k in ring or k in lines or rng.random()>extra_p or deg[k[0]]>=6 or deg[k[1]]>=6: continue
        if inside(*k) and not hugs(*k): lines.add(k); deg[k[0]]+=1; deg[k[1]]+=1
    return dict(pts=pts, ne=ne, ring=sorted(ring), lines=sorted(lines))

def render(parts, rng):
    M=N*SS; alpha=np.zeros((M,M),np.float32); P=lambda p:(int(round(p[0]*SS*16)),int(round(p[1]*SS*16)))
    layers={lv:np.zeros((M,M),np.uint8) for lv in LEVELS}; top=np.zeros((M,M),np.uint8); solid=np.zeros((M,M),np.uint8)
    for pt in parts:
        for a,b in pt['lines']: cv2.line(layers[LEVELS[rng.integers(len(LEVELS))]],P(pt['pts'][a]),P(pt['pts'][b]),255,int(round(LINE_IN*SS)),cv2.LINE_AA,4)
        for a,b in pt['ring']: cv2.line(top,P(pt['pts'][a]),P(pt['pts'][b]),255,int(round(LINE_EDGE[0]*SS)),cv2.LINE_AA,4)
        for i,p in enumerate(pt['pts']):
            lo,hi=DOT_EDGE if i<pt['ne'] else DOT_IN; cv2.circle(solid,P(p),int(round(rng.uniform(lo,hi)/2*SS*16)),255,-1,cv2.LINE_AA,4)
    for lv,m in layers.items(): alpha=np.maximum(alpha,m.astype(np.float32)/255*lv)
    alpha=np.maximum(alpha,top.astype(np.float32)/255*LINE_EDGE[1]); alpha=np.maximum(alpha,solid.astype(np.float32)/255)
    a=cv2.resize(alpha,(N,N),interpolation=cv2.INTER_AREA)
    return (BG+a[...,None]*(INK-BG)).round().astype(np.uint8), a
