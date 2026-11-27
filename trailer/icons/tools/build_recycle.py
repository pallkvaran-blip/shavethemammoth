# Recycling icon for the light set, arrows only: python build.py <seed> [<seed> ...] writes built-<seed>.png here.
import os, sys, cv2, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from mesh import N, SP, BG, INK, along, part, render
S=os.path.dirname(os.path.abspath(__file__))+'/'
RT=856.; W=195.; HEAD_HALF=185.; HEAD_LEN=230.; T_TAIL=0.60; T_TIP=0.50      # px in the 2048 frame
def rot(p,deg):
    a=np.radians(deg); c,s=np.cos(a),np.sin(a); return np.array([p[0]*c-p[1]*s,p[0]*s+p[1]*c])
V=[rot(np.array([0,RT]),-120*k) for k in range(3)]; L=np.linalg.norm(V[1]-V[0])   # y up, clockwise from the top
def arrow_corners():
    a,b,c=V[2],V[0],V[1]; u1=(b-a)/L; u2=(c-b)/L; n1=np.array([-u1[1],u1[0]]); n2=np.array([-u2[1],u2[0]]); h=W/2
    P0=a+u1*L*T_TAIL; tip=b+u2*L*T_TIP; P2=tip-u2*HEAD_LEN; mid=(n1+n2)/np.linalg.norm(n1+n2)
    t=np.linalg.solve(np.array([u1,-u2]).T,(P2-n2*h)-(P0-n1*h))[0]; inner=(P0-n1*h)+t*u1
    return [P0+n1*h, b+n1*h, b+mid*h, b+n2*h, P2+n2*h, P2+n2*HEAD_HALF, tip, P2-n2*HEAD_HALF, P2-n2*h, inner, P0-n1*h]
A=arrow_corners(); ALL=np.array([rot(p,-120*k) for k in range(3) for p in A])
mid=(ALL.min(0)+ALL.max(0))/2                                   # centre the whole symbol's box in the frame
def px(p): return np.array([N/2+(p[0]-mid[0]), N/2-(p[1]-mid[1])])
def outlines(): return [along(np.array([px(rot(p,-120*k)) for p in A])) for k in range(3)]
if __name__=='__main__':
    O=outlines(); box=np.vstack(O); print('symbol box px',np.round(box.min(0)),np.round(box.max(0)),'size',np.round(box.max(0)-box.min(0)),'dots on one arrow outline',len(O[0]))
    m=np.zeros((N*2,N*2),np.uint8)
    for o in O: cv2.fillPoly(m,[np.round(o*2*16).astype(np.int32)],255,cv2.LINE_AA,4)
    m=cv2.resize(m,(N,N),interpolation=cv2.INTER_AREA); cv2.imwrite(S+'mask.png',m)
    cv2.imwrite(S+'ref-shape.png',(BG+(m/255.0)[...,None]*(INK-BG)).round().astype(np.uint8))
    for seed in (int(x) for x in sys.argv[1:]):
        rng=np.random.default_rng(seed); parts=[part([o],rng) for o in O]
        img,a=render(parts,rng); cv2.imwrite(S+f'built-{seed}.png',img,[cv2.IMWRITE_PNG_COMPRESSION,9])
        print(seed,'dots',sum(len(p['pts']) for p in parts),'lines',sum(len(p['lines'])+len(p['ring']) for p in parts),'inside dots per arrow',[len(p['pts'])-p['ne'] for p in parts])
