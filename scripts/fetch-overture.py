"""Scarica da Overture Maps (S3 pubblico, AWS Open Data) i civici georeferenziati dell'area di gioco.

In Italia il tema "addresses" di Overture contiene il dataset it/countrywide di OpenAddresses
(derivato dall'ANNCSU, licenza CC-BY 4.0): via, numero civico e coordinate.
Uso: python3 scripts/fetch-overture.py      (richiede: pip install pyarrow)
Salva data/raw/overture/addresses.json
"""
import json
import os
import pathlib

import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pf

RELEASE = os.environ.get('OVERTURE_RELEASE', '2026-10-21.0')
W, S, E, N = 11.585, 45.325, 11.715, 45.415
OUT = pathlib.Path('data/raw/overture')
OUT.mkdir(parents=True, exist_ok=True)

opts = {'anonymous': True, 'region': 'us-west-2'}
proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
if proxy:
    opts['proxy_options'] = proxy
ca = os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
if ca:
    opts['tls_ca_file_path'] = ca
fs = pf.S3FileSystem(**opts)

d = ds.dataset(f'overturemaps-us-west-2/release/{RELEASE}/theme=addresses/type=address', filesystem=fs, format='parquet')
b = lambda k: pc.field('bbox', k)
flt = (b('xmin') > W) & (b('xmax') < E) & (b('ymin') > S) & (b('ymax') < N)
tb = d.to_table(filter=flt, columns=['street', 'number', 'unit', 'address_levels', 'bbox', 'sources'])

out = []
for r in tb.to_pylist():
    if not r['number']:
        continue
    lv = r['address_levels'] or []
    out.append({
        'lon': round(r['bbox']['xmin'], 7), 'lat': round(r['bbox']['ymin'], 7),
        's': r['street'] or '', 'n': r['number'] + (('/' + r['unit']) if r['unit'] else ''),
        'c': lv[-1]['value'] if lv else '',
        'src': r['sources'][0]['dataset'] if r['sources'] else '',
    })
(OUT / 'addresses.json').write_text(json.dumps({'release': RELEASE, 'addresses': out}))
print('addresses', len(out))
