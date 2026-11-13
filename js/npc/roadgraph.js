// Grafo stradale reale (nodi OSM condivisi) con A* per pedoni e auto.
const NO_CAR = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'bridleway']);

class Heap {
  constructor() { this.a = []; }
  push(n, f) {
    const a = this.a;
    a.push([f, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() { return this.a.length; }
}

export class RoadGraph {
  constructor(data) {
    const N = (this.N = data.roadNodes);
    const n = (this.n = N.length / 2);
    this.adj = Array.from({ length: n }, () => []);
    this.roadOf = new Int32Array(n).fill(-1);
    this.width = new Float32Array(n).fill(3);
    for (let ri = 0; ri < data.roads.length; ri++) {
      const r = data.roads[ri];
      const car = !NO_CAR.has(r.t);
      const walkW = ['footway', 'path', 'steps', 'cycleway', 'track', 'pedestrian', 'bridleway'].includes(r.t) ? 0 : 1;
      const cost = r.t === 'track' ? 2.5 : r.t === 'service' ? 1.3 : ['primary', 'secondary', 'tertiary'].includes(r.t) ? 0.8 : 1;
      for (let k = 0; k + 1 < r.i.length; k++) {
        const a = r.i[k], b = r.i[k + 1];
        const L = Math.hypot(N[a * 2] - N[b * 2], N[a * 2 + 1] - N[b * 2 + 1]);
        this.adj[a].push({ to: b, L, car, cost, road: ri, side: walkW });
        if (!(r.o && car)) this.adj[b].push({ to: a, L, car, cost, road: ri, side: walkW });
        else this.adj[b].push({ to: a, L, car: false, cost, road: ri, side: walkW });
        if (this.roadOf[a] < 0) this.roadOf[a] = ri;
        if (this.roadOf[b] < 0) this.roadOf[b] = ri;
      }
    }
    this.roads = data.roads;
    // componenti connesse (per pedoni e per auto)
    this.compWalk = this.components(false);
    this.compCar = this.components(true);
  }

  components(car) {
    const comp = new Int32Array(this.n).fill(-1);
    const sizes = [];
    let c = 0;
    for (let s = 0; s < this.n; s++) {
      if (comp[s] >= 0) continue;
      const stack = [s];
      comp[s] = c;
      let size = 0;
      while (stack.length) {
        const u = stack.pop();
        size++;
        for (const e of this.adj[u]) {
          if (car && !e.car) continue;
          if (comp[e.to] < 0) { comp[e.to] = c; stack.push(e.to); }
        }
      }
      sizes.push(size);
      c++;
    }
    let big = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i;
    return { comp, big, sizes };
  }

  inMain(i, car) {
    const c = car ? this.compCar : this.compWalk;
    return c.comp[i] === c.big;
  }

  x(i) { return this.N[i * 2]; }
  z(i) { return this.N[i * 2 + 1]; }

  // A* (ritorna lista di nodi o null)
  path(start, goal, car = false, maxIter = 40000) {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [start];
    const N = this.N;
    const gx = N[goal * 2], gz = N[goal * 2 + 1];
    const g = new Map();
    const came = new Map();
    const open = new Heap();
    g.set(start, 0);
    open.push(start, 0);
    let it = 0;
    while (open.size && it++ < maxIter) {
      const u = open.pop();
      if (u === goal) {
        const out = [u];
        let c = u;
        while (came.has(c)) { c = came.get(c); out.push(c); }
        return out.reverse();
      }
      const gu = g.get(u);
      for (const e of this.adj[u]) {
        if (car && !e.car) continue;
        const ng = gu + e.L * (car ? e.cost : 1);
        const old = g.get(e.to);
        if (old === undefined || ng < old) {
          g.set(e.to, ng);
          came.set(e.to, u);
          const h = Math.hypot(N[e.to * 2] - gx, N[e.to * 2 + 1] - gz) * (car ? 0.8 : 1);
          open.push(e.to, ng + h);
        }
      }
    }
    return null;
  }

  // larghezza della strada tra due nodi (per spostarsi sul lato destro)
  edgeInfo(a, b) {
    for (const e of this.adj[a]) if (e.to === b) return e;
    return null;
  }
}
