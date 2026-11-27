# Recycling icon for the light set: python build_recycle.py <seed> [<seed> ...] writes built-<seed>.png here.
import os, sys, cv2, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import mesh
from mesh import N, SP, along, part, render
S=os.path.dirname(os.path.abspath(__file__))+'/'
RO=235/310*N/2; C=np.array([N/2,N/2])                      # ring: as wide in its frame as in the original picture, dead centre
RING_IN=0.82; RT=0.62; W=0.18; HEAD_HALF=0.20; HEAD_LEN=0.24; T_TAIL=0.64; T_TIP=0.52
def rot(p,deg):
    a=np.radians(deg); c,s=np.cos(a),np.sin(a); return np.array([p[0]*c-p[1]*s,p[0]*s+p[1]*c])
V=[rot(np.array([0,RT]),-120*k) for k in range(3)]; L=np.linalg.norm(V[1]-V[0])
def arrow_corners():
    a,b,c=V[2],V[0],V[1]; u1=(b-a)/L; u2=(c-b)/L; n1=np.array([-u1[1],u1[0]]); n2=np.array([-u2[1],u2[0]]); h=W/2
    P0=a+u1*L*T_TAIL; tip=b+u2*L*T_TIP; P2=tip-u2*HEAD_LEN
    mid=(n1+n2)/np.linalg.norm(n1+n2)
    t=np.linalg.solve(np.array([u1,-u2]).T,(P2-n2*h)-(P0-n1*h))[0]; inner=(P0-n1*h)+t*u1
    return [P0+n1*h, b+n1*h, b+n2*h, P2+n2*h, P2+n2*HEAD_HALF, tip, P2-n2*HEAD_HALF, P2-n2*h, inner, P0-n1*h]
def px(p): return C+np.array([p[0],-p[1]])*RO
def circle(r,n,phase=0): return np.array([C+r*np.array([np.cos(2*np.pi*(k+phase)/n),-np.sin(2*np.pi*(k+phase)/n)]) for k in range(n)])
for seed in (int(x) for x in sys.argv[1:]):
    rng=np.random.default_rng(seed)
    n_out=3*int(round(2*np.pi*RO/SP/3)); n_in=3*int(round(2*np.pi*RO*RING_IN/SP/3))
    parts=[part([circle(RO,n_out,0.25*0),circle(RO*RING_IN,n_in,0.5)],rng)]
    A=arrow_corners()
    one=part([along(np.array([px(p) for p in A]))],rng,extra_p=0.16,clear=50)
    for k in range(3):                                   # the same arrow three times, a third of a turn apart
        t=np.radians(120*k); Rm=np.array([[np.cos(t),-np.sin(t)],[np.sin(t),np.cos(t)]])
        parts.append(dict(one,pts=(one['pts']-C)@Rm.T+C))
    img,a=render(parts,rng); cv2.imwrite(S+f'built-{seed}.png',img,[cv2.IMWRITE_PNG_COMPRESSION,9])
    print(seed,'dots',sum(len(p['pts']) for p in parts),'lines',sum(len(p['lines'])+len(p['ring']) for p in parts),'ring dots out/in',n_out,n_in,'arrow outline dots',parts[1]['ne'],'inside',len(parts[1]['pts'])-parts[1]['ne'])
