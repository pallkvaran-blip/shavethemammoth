"""A small client for Replicate: upload a file, run a model, fetch what it made. The key comes from the environment.
Every run is noted in ledger.jsonl (model, id, status, seconds), so that what was spent can be added up afterwards."""
import json, os, sys, time, mimetypes, pathlib
import requests

API = 'https://api.replicate.com/v1'
HERE = pathlib.Path(__file__).parent
TOKEN = os.environ['REPLICATE_API_TOKEN']
H = {'Authorization': 'Bearer ' + TOKEN}


def upload(path):
    path = pathlib.Path(path)
    mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    with open(path, 'rb') as f:
        r = requests.post(API + '/files', headers=H, files={'content': (path.name, f, mime)}, timeout=300)
    r.raise_for_status()
    return r.json()['urls']['get']


def run(model, inputs, version=None, timeout=1800, note=''):
    """model: 'owner/name' (an official model), or with version=... for a community one. Returns the finished prediction."""
    if version:
        send = lambda: requests.post(API + '/predictions', headers={**H, 'Prefer': 'wait=30'}, json={'version': version, 'input': inputs}, timeout=120)
    else:
        send = lambda: requests.post(f'{API}/models/{model}/predictions', headers={**H, 'Prefer': 'wait=30'}, json={'input': inputs}, timeout=120)
    r = send()
    tries = 0
    while r.status_code == 429 and tries < 8:
        # (an account low on credit may start one run at a time, a few a minute: wait as long as it says and ask again)
        tries += 1
        time.sleep(float((r.json() or {}).get('retry_after', 10)) + 2)
        r = send()
    if r.status_code >= 400:
        raise RuntimeError(f'{model}: HTTP {r.status_code}: {r.text[:600]}')
    p = r.json()
    t0 = time.time()
    while p.get('status') not in ('succeeded', 'failed', 'canceled'):
        if time.time() - t0 > timeout:
            raise RuntimeError(f'{model}: still {p.get("status")} after {timeout} s (id {p.get("id")})')
        time.sleep(4)
        g = requests.get(p['urls']['get'], headers=H, timeout=60)
        g.raise_for_status()
        p = g.json()
    with open(HERE / 'ledger.jsonl', 'a') as f:
        f.write(json.dumps({'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'model': model, 'id': p.get('id'), 'status': p.get('status'),
                            'seconds': (p.get('metrics') or {}).get('predict_time'), 'note': note}) + '\n')
    if p.get('status') != 'succeeded':
        raise RuntimeError(f'{model}: {p.get("status")}: {str(p.get("error"))[:800]}')
    return p


def fetch(url, to):
    to = pathlib.Path(to)
    to.parent.mkdir(parents=True, exist_ok=True)
    # (what a model made is fetched from Replicate's own store; its address needs the key only on api.replicate.com)
    with requests.get(url, headers=H if url.startswith(API) else {}, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(to, 'wb') as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return to


def outputs(p):
    o = p.get('output')
    if o is None: return []
    if isinstance(o, str): return [o]
    if isinstance(o, dict): return [v for v in o.values() if isinstance(v, str) and v.startswith('http')]
    return [x for x in o if isinstance(x, str)]
