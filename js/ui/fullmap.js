// Mappa geografica del comune (Leaflet): tile OpenStreetMap + mappa del gioco, vie, civici, POI, piccione, missioni.
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/leaflet/leaflet.js';
      s.onload = () => res(window.L);
      s.onerror = rej;
      document.head.append(s);
    });
  }
  return leafletPromise;
}

const POI_ICON = (t) => (t === 'bar' || t === 'cafe' ? '☕' : t === 'restaurant' ? '🍝' : t === 'place_of_worship' ? '⛪' : t === 'pharmacy' ? '💊' : t === 'post_office' ? '✉️' : t === 'townhall' ? '🏛' : t.startsWith('shop') ? '🛒' : t === 'school' || t === 'kindergarten' || t === 'childcare' ? '🏫' : t === 'peak' ? '⛰' : t.startsWith('tourism') ? '🏨' : t === 'fuel' ? '⛽' : t.includes('winery') ? '🍷' : '•');

export class FullMap {
  constructor(game) {
    this.g = game;
    this.open = false;
    this.map = null;
    document.getElementById('mapClose').addEventListener('click', () => game.toggleMap(false));
    document.getElementById('mapCenter').addEventListener('click', () => this.centerPigeon());
    document.getElementById('mapNumbers').addEventListener('change', () => this.refreshDynamic());
    document.getElementById('mapPeople').addEventListener('change', () => this.refreshPeople());
  }

  ll(x, z) { return this.g.data.geo.toLatLon(x, z); }

  async show() {
    this.open = true;
    document.getElementById('mapScreen').classList.remove('hidden');
    const L = await loadLeaflet();
    if (!this.map) this.build(L);
    this.map.invalidateSize();
    this.centerPigeon();
    this.updateLive();
    this.timer = setInterval(() => this.updateLive(), 500);
  }

  hide() {
    this.open = false;
    document.getElementById('mapScreen').classList.add('hidden');
    clearInterval(this.timer);
  }

  build(L) {
    const d = this.g.data;
    const T = d.terrain;
    const map = (this.map = L.map('leaflet', { zoomControl: true, maxZoom: 20, minZoom: 12, attributionControl: true, preferCanvas: true }));
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, maxNativeZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    });
    // mappa del gioco (raster generato dai dati OSM)
    const sw = this.ll(T.x0, T.z1), ne = this.ll(T.x1, T.z0);
    let gameLayer = null;
    try {
      const url = this.g.world.land.canvas.toDataURL('image/jpeg', 0.85);
      gameLayer = L.imageOverlay(url, [sw, ne], { attribution: 'Mappa del gioco da dati OSM' });
    } catch (e) { console.warn(e); }
    osm.addTo(map);
    // se le tile non si caricano (offline) passa alla mappa del gioco
    let tileErr = 0;
    osm.on('tileerror', () => { if (++tileErr === 6 && gameLayer && !map.hasLayer(gameLayer)) { map.removeLayer(osm); gameLayer.addTo(map); } });
    const base = { 'OpenStreetMap': osm };
    if (gameLayer) base['Mappa del gioco (3D)'] = gameLayer;
    // confine comunale
    const border = L.layerGroup();
    for (const ring of d.boundary) {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(this.ll(ring[i], ring[i + 1]));
      L.polygon(pts, { color: '#8b1e2d', weight: 3, dashArray: '8 6', fill: false }).addTo(border);
    }
    border.addTo(map);
    // POI
    const pois = L.layerGroup();
    const seen = new Set();
    for (const p of d.pois) {
      if (!p.n || p.t === 'bench' || p.t.startsWith('place:hamlet')) continue;
      const k = p.n + Math.round(p.x / 30) + ',' + Math.round(p.z / 30);
      if (seen.has(k)) continue;
      seen.add(k);
      const isPlace = p.t.startsWith('place:');
      const icon = L.divIcon({ className: '', html: isPlace ? `<div class="poi-label" style="font-weight:bold;font-size:13px">${esc(p.n)}</div>` : `<div class="poi-label">${POI_ICON(p.t)} ${esc(p.n)}</div>`, iconSize: null });
      L.marker(this.ll(p.x, p.z), { icon, interactive: false }).addTo(pois);
    }
    pois.addTo(map);
    this.dyn = L.layerGroup().addTo(map);
    this.people = L.layerGroup().addTo(map);
    this.targets = L.layerGroup().addTo(map);
    L.control.layers(base, { 'Confine comunale': border, 'Luoghi': pois, 'Civici e vie': this.dyn }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    this.pigeon = L.marker(this.ll(0, 0), { icon: L.divIcon({ className: '', html: '<div class="pigeon-marker">🐦</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), zIndexOffset: 1000 }).addTo(map);
    map.fitBounds([this.ll(d.bounds.x0, d.bounds.z1), this.ll(d.bounds.x1, d.bounds.z0)]);
    map.on('moveend zoomend', () => this.refreshDynamic());
    map.on('mousemove', (e) => {
      const [x, z] = d.geo.toXZ(e.latlng.lat, e.latlng.lng);
      document.getElementById('mapCoords').textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)} · quota ${Math.round(d.terrain.heightAt(x, z))} m`;
    });
    // etichette delle vie: un punto per via
    this.streetLabels = [];
    const N = d.roadNodes;
    const byName = new Map();
    for (const r of d.roads) {
      if (!r.n) continue;
      const mid = r.i[Math.floor(r.i.length / 2)];
      if (!byName.has(r.n)) byName.set(r.n, []);
      byName.get(r.n).push([N[mid * 2], N[mid * 2 + 1], r.i.length]);
    }
    for (const [name, list] of byName) {
      // al massimo un'etichetta ogni 350 m per la stessa via
      const kept = [];
      for (const pt of list.sort((a, b) => b[2] - a[2])) if (kept.every((k) => Math.hypot(k[0] - pt[0], k[1] - pt[1]) > 350)) kept.push(pt);
      for (const k of kept) this.streetLabels.push({ name, x: k[0], z: k[1] });
    }
    this.L = L;
    this.refreshDynamic();
  }

  refreshDynamic() {
    if (!this.map) return;
    const L = this.L, map = this.map, d = this.g.data;
    this.dyn.clearLayers();
    const z = map.getZoom();
    const b = map.getBounds();
    const inView = (x, zz) => b.contains(this.ll(x, zz));
    // vie del gioco (sempre utili, anche sopra le tile)
    if (z >= 16) {
      for (const s of this.streetLabels) {
        if (!inView(s.x, s.z)) continue;
        L.marker(this.ll(s.x, s.z), { icon: L.divIcon({ className: '', html: `<div class="poi-label" style="background:#fffbe6">${esc(s.name)}</div>`, iconSize: null }), interactive: false }).addTo(this.dyn);
      }
    }
    if (z >= 17 && document.getElementById('mapNumbers').checked) {
      let n = 0;
      for (const a of d.addresses) {
        if (n > 900) break;
        if (!inView(a.x, a.z)) continue;
        n++;
        const html = `<div class="hn${a.e ? ' est' : ''}" title="${esc(a.s)} ${esc(a.n)}${a.e ? ' (stimato)' : ''}">${esc(a.n)}</div>`;
        L.marker(this.ll(a.x, a.z), { icon: L.divIcon({ className: '', html, iconSize: null }), interactive: false }).addTo(this.dyn);
      }
    }
  }

  refreshPeople() {
    if (!this.map) return;
    this.people.clearLayers();
    if (!document.getElementById('mapPeople').checked) return;
    const L = this.L;
    for (const a of this.g.npc.agents) {
      if (a.state === 'inside' || a.state === 'plan') continue;
      L.circleMarker(this.ll(a.x, a.z), { radius: 3, color: '#333', weight: 1, fillColor: a.special ? '#e33' : '#ffd36b', fillOpacity: 1 }).bindTooltip(`${a.first} ${a.last}` + (a.title ? ` (${a.title})` : '')).addTo(this.people);
    }
  }

  updateLive() {
    if (!this.map) return;
    const L = this.L;
    const p = this.g.pigeon.pos;
    this.pigeon.setLatLng(this.ll(p.x, p.z));
    this.targets.clearLayers();
    for (const t of this.g.missions.targets()) {
      L.marker(this.ll(t.x, t.z), { icon: L.divIcon({ className: '', html: `<div class="target-marker" title="${esc(t.label || '')}">${t.icon || '📍'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).bindTooltip(t.label || 'Obiettivo').addTo(this.targets);
    }
    this.refreshPeople();
  }

  centerPigeon() {
    if (!this.map) return;
    const p = this.g.pigeon.pos;
    this.map.setView(this.ll(p.x, p.z), 17);
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
