// Missioni: campagna "Operazione Occhio di Colombo" (8 missioni) + missioni procedurali infinite.
import * as THREE from 'three';
import { TOPIC_LABEL } from '../npc/dialogue.js';

const COLOR_NAMES = [['#f2f2f0', 'bianca'], ['#c0c4c8', 'grigio chiaro'], ['#2a2a2e', 'nera'], ['#a3242a', 'rossa'], ['#2b4f8a', 'blu'], ['#6d7177', 'grigia'], ['#2f5233', 'verde'], ['#d9cfb0', 'beige'], ['#e8e8e8', 'bianca'], ['#8a8f96', 'grigia'], ['#1f3b5c', 'blu scuro'], ['#0d0d10', 'nera']];
function colorName(c) {
  let best = 'colorata', bd = 1e9;
  for (const [h, n] of COLOR_NAMES) {
    const k = new THREE.Color(h);
    const d = (k.r - c.r) ** 2 + (k.g - c.g) ** 2 + (k.b - c.b) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export const STORY_N = 16;

export class Missions {
  constructor(game) {
    this.g = game;
    this.state = { story: 0, proc: 0, points: 0, done: [], upgrades: {}, ach: {} };
    this.current = null;
    this.props = [];
    this.rnd = Math.random;
  }

  // ------------------------------------------------------------ utilità sui dati reali
  poi(pred, near) {
    const list = this.g.data.pois.filter(pred);
    if (!list.length) return null;
    if (!near) return list[0];
    return list.sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z))[0];
  }
  spawnPoint() { return this.g.data.spawn; }
  groundY(x, z) { return this.g.world.surfaceAt(x, z).y; }
  streetName(x, z) { return this.g.npc.streetNear(x, z) || 'una strada di campagna'; }
  village(x, z) { return this.g.npc.villageName(x, z); }

  // ------------------------------------------------------------ costruttori di passi
  S_goto(o) {
    return {
      text: o.text, type: 'goto',
      targets: () => { const p = o.pos(); return [{ ...p, label: o.label, icon: '📍' }]; },
      update: () => {
        const p = o.pos(), pg = this.g.pigeon;
        const d = Math.hypot(p.x - pg.pos.x, p.z - pg.pos.z);
        if (o.building) return pg.mode === 'ground' && pg.onBuilding && (pg.onBuilding === o.building || o.buildings?.includes(pg.onBuilding));
        if (o.land && pg.mode !== 'ground') return false;
        return d < o.r;
      },
      progress: () => { const p = o.pos(); return 'Distanza: ' + fmtDist(Math.hypot(p.x - this.g.pigeon.pos.x, p.z - this.g.pigeon.pos.z)); },
    };
  }
  S_listen(o) {
    let n = 0;
    return {
      text: o.text, type: 'listen',
      targets: () => (o.pos ? [{ ...o.pos(), label: o.label, icon: '👂' }] : []),
      enter: () => { if (o.bias) this.g.npc.topicBias.push(o.bias); },
      leave: () => { if (o.bias) this.g.npc.topicBias = this.g.npc.topicBias.filter((b) => b !== o.bias); },
      event: (ev) => {
        if (ev.type !== 'heard' || ev.fraction < 0.5) return false;
        const c = ev.convo;
        if (o.topic && c.topic !== o.topic && c.topic2 !== o.topic) return false;
        if (o.pos) { const p = o.pos(); if (Math.hypot(c.x - p.x, c.z - p.z) > o.r) return false; }
        if (o.agents && !o.agents.some((a) => c.a === a || c.b === a)) return false;
        n++;
        return n >= (o.count || 1);
      },
      progress: () => `Conversazioni ascoltate: ${n}/${o.count || 1}` + (o.topic ? ` · argomento: ${TOPIC_LABEL[o.topic]}` : ''),
    };
  }
  S_photo(o) {
    return {
      text: o.text, type: 'photo',
      targets: () => [{ ...o.pos(), label: o.label, icon: '📷' }],
      photoTarget: () => ({ ...o.pos(), label: o.label, maxD: o.maxD || 25 }),
      event: (ev) => ev.type === 'photo' && ev.ok,
      progress: () => 'Premi Q per la fotocamera, inquadra il bersaglio e scatta',
    };
  }
  S_steal(o) {
    let n = 0;
    return {
      text: o.text, type: 'steal',
      targets: () => [],
      event: (ev) => { if (ev.type === 'steal') n++; return n >= o.count; },
      progress: () => `Batterie rubate: ${n}/${o.count} (cerca il bagliore verde)`,
    };
  }
  S_follow(o) {
    let t = 0, warn = 0;
    return {
      text: o.text, type: 'follow',
      targets: () => [{ x: o.agent.x, y: o.agent.y + 2, z: o.agent.z, label: o.label, icon: '🕵' }],
      update: (dt) => {
        const pg = this.g.pigeon.pos, a = o.agent;
        const d = Math.hypot(a.x - pg.x, a.z - pg.z);
        if (d > o.maxD) {
          warn += dt;
          if (warn > 8) { t = 0; warn = 0; this.g.hud.toast('Lo hai perso di vista! Il pedinamento ricomincia.', 'bad'); }
          return false;
        }
        warn = 0;
        if (d < o.minD && Math.abs(pg.y - a.y) < 2.5) {
          t = 0;
          this.g.hud.toast(`${a.first} ti ha notato! Stai più lontano.`, 'bad');
          this.g.addSuspicion(15);
          return false;
        }
        t += dt;
        return t >= o.duration;
      },
      progress: () => `Pedinamento: ${Math.floor(t)}/${o.duration} s · resta entro ${o.maxD} m ma non più vicino di ${o.minD} m`,
    };
  }
  S_poop(o) {
    return {
      text: o.text, type: 'poop',
      targets: () => { const r = o.ref; return [{ x: r.x, y: (r.y || 0) + 2, z: r.z, label: o.label, icon: '💩' }]; },
      event: (ev) => ev.type === 'poop' && ev.hit && ev.hit.ref === o.ref,
      progress: () => 'Volagli sopra e premi F',
    };
  }
  S_wait(o) {
    return {
      text: o.text, type: 'wait', targets: () => [],
      update: () => { const h = this.g.dayNight.time; return h >= o.from || h < o.to; },
      progress: () => 'Ora attuale: ' + this.g.dayNight.clock() + ' · tieni premuto T per accelerare il tempo',
    };
  }
  S_perch(o) {
    let t = 0;
    return {
      text: o.text, type: 'perch',
      targets: () => [{ ...o.pos(), label: o.label, icon: '🪶' }],
      update: (dt) => {
        const pg = this.g.pigeon;
        const ok = pg.mode === 'ground' && pg.support && o.kinds.includes(pg.support.kind) && (!o.r || Math.hypot(pg.pos.x - o.pos().x, pg.pos.z - o.pos().z) < o.r);
        t = ok ? t + dt : Math.max(0, t - dt * 2);
        return t >= o.duration;
      },
      progress: () => `Appollaiato: ${Math.floor(t)}/${o.duration} s`,
    };
  }
  S_bug(o) {
    return {
      text: o.text, type: 'bug',
      targets: () => [{ x: o.ref.x, y: o.ref.y + 2, z: o.ref.z, label: o.label, icon: '🐞' }],
      event: (ev) => ev.type === 'interact' && Math.hypot(this.g.pigeon.pos.x - o.ref.x, this.g.pigeon.pos.z - o.ref.z) < 2.6,
      progress: () => { const d = Math.hypot(this.g.pigeon.pos.x - o.ref.x, this.g.pigeon.pos.z - o.ref.z); return d < 2.6 ? 'Premi E per piazzare la cimice!' : 'Distanza: ' + fmtDist(d); },
    };
  }
  S_poopAt(o) {
    return {
      text: o.text, type: 'poopAt',
      targets: () => [{ ...o.pos(), label: o.label, icon: '💩' }],
      event: (ev) => { if (ev.type !== 'poop' || !ev.hit) return false; const p = o.pos(); return Math.hypot(ev.hit.x - p.x, ev.hit.z - p.z) < o.r; },
      progress: () => 'Volaci sopra e premi F',
    };
  }
  S_timed(o) {
    let t = o.time;
    return {
      text: o.text, type: 'timed',
      targets: () => [{ ...o.pos(), label: o.label, icon: '⏱' }],
      enter: () => { t = o.time; o.onEnter?.(); },
      update: (dt) => {
        t -= dt;
        const pg = this.g.pigeon, p = o.pos();
        if (o.building ? pg.mode === 'ground' && pg.onBuilding === o.building : Math.hypot(p.x - pg.pos.x, p.z - pg.pos.z) < o.r) return true;
        if (t <= 0) { t = o.time; this.g.hud.toast('⏱ Tempo scaduto! Riprova da capo.', 'bad'); o.onFail?.(); }
        return false;
      },
      progress: () => `Tempo rimasto: ${Math.ceil(Math.max(0, t))} s · ${fmtDist(Math.hypot(o.pos().x - this.g.pigeon.pos.x, o.pos().z - this.g.pigeon.pos.z))}`,
    };
  }
  S_coo() {
    return { text: 'Tuba per segnalare al Gran Maestro che sei in posizione (tasto V).', type: 'coo', targets: () => [], event: (ev) => ev.type === 'coo', progress: () => 'Premi V per tubare' };
  }

  // ------------------------------------------------------------ campagna
  story(i) {
    const g = this.g;
    const spawn = this.spawnPoint();
    const W = g.world;
    switch (i) {
      case 0: {
        const ch = this.poi((p) => p.t === 'place_of_worship' && /Giovanni/.test(p.n || ''), spawn) || this.poi((p) => p.t === 'place_of_worship', spawn);
        const rec = W.buildingAt(ch.x, ch.z) || W.buildingsNear(ch.x, ch.z, 20)[0];
        const tower = W.buildingsNear(ch.x, ch.z, 45).find((b) => b.d.k === 'tower');
        const bs = [rec, tower].filter(Boolean);
        const t = tower || rec;
        return {
          title: '1 · Attivazione', reward: 10,
          brief: `Agente P-77, qui parla il Gran Maestro Colombo.\n\nI tuoi circuiti sono stati attivati a Carbonara, frazione di Rovolon. Da oggi sarai i nostri occhi sui Colli Euganei.\n\nPer prima cosa vola sul ${tower ? 'campanile' : 'tetto'} della ${ch.n || 'chiesa'} e posati. Da lassù avrai una visuale perfetta sul paese.\n\n(Spazio per decollare e salire, WASD per dirigerti, C per scendere.)`,
          steps: [
            this.S_goto({ text: `Posati sul ${tower ? 'campanile' : 'tetto'} della ${ch.n || 'chiesa'}.`, label: ch.n || 'Chiesa', building: t, buildings: bs, pos: () => ({ x: t.c[0], y: t.top + 1, z: t.c[1] }) }),
            this.S_coo(),
          ],
        };
      }
      case 1: {
        const bar = this.poi((p) => ['bar', 'cafe'].includes(p.t) && p.n, spawn);
        const pl = g.npc.placeAt(bar.x, bar.z, bar.n, 'bar', false, 5);
        const a = g.npc.addSpecial({ first: 'Bepi', last: 'Zanon', place: pl, topic: 'sagra', talkCD: 2, alwaysShow: true, role: 'elder', hat: true });
        const b = g.npc.addSpecial({ first: 'Nives', last: 'Trevisan', gender: 'f', place: pl, topic: 'sagra', talkCD: 0, alwaysShow: true, role: 'elder' });
        this.tempAgents = [a, b];
        return {
          title: '2 · Chiacchiere al bar', reward: 15,
          brief: `Ottimo lavoro, P-77.\n\nAl bar "${bar.n}" i pensionati sanno tutto di tutti. Si dice che alla prossima sagra succederà qualcosa di… speciale.\n\nAvvicinati senza farti notare e ascolta una conversazione sulla sagra. Resta entro 15 metri: i sottotitoli ti diranno cosa si dicono.`,
          steps: [
            this.S_goto({ text: `Raggiungi il bar "${bar.n}".`, label: bar.n, r: 40, pos: () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z }) }),
            this.S_listen({ text: 'Ascolta i pensionati che parlano della sagra.', topic: 'sagra', r: 40, label: bar.n, pos: () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z }) }),
          ],
          cleanup: () => { for (const x of this.tempAgents || []) g.npc.removeAgent(x); this.tempAgents = null; },
        };
      }
      case 2:
        return {
          title: '3 · Energia rubata', reward: 0,
          brief: 'La tua batteria non è eterna, P-77. Gli Illuminati non pagano le bollette: le batterie si prendono dove si trovano.\n\nRuba 2 batterie in paese: brillano di verde, davanti ai negozi, sulle panchine e sui tetti. Avvicinati e premi E.\n\nAttento: se qualcuno ti vede rubare, la tua copertura (👁) ne risentirà.',
          steps: [this.S_steal({ text: 'Ruba 2 batterie (E).', count: 2 })],
        };
      case 3: {
        const post = this.poi((p) => p.t === 'post_office' && /Bastia/.test(p.n || '')) || this.poi((p) => p.t === 'post_office', spawn);
        const pl = g.npc.placeAt(post.x, post.z, post.n, 'post', false, 3);
        // giro di consegne: porte vicine
        const houses = W.buildingsNear(pl.x, pl.z, 380).filter((b) => b.d.k === 'house' && b.door.node >= 0 && g.graph.inMain(b.door.node, false));
        const stops = [];
        for (let k = 0; k < 8 && houses.length; k++) {
          const h = houses[Math.floor(this.rnd() * houses.length)];
          stops.push({ x: h.door.x + h.door.nx * 0.8, z: h.door.z + h.door.nz * 0.8, node: h.door.node, name: 'consegna', kind: 'stop', indoor: false, r: 0.5 });
        }
        stops.push(pl);
        let si = 0;
        const postman = g.npc.addSpecial({
          first: 'Renzo', last: 'Callegaro', title: 'il postino', place: pl, alwaysShow: true, noTalk: true, speed: 1.15, hat: true,
          colors: { shirt: '#f4c430', pants: '#1f3a68', hair: '#1f3a68' },
          update: (a) => {
            if (a.state === 'idle' && a.idleT < 2.5) { si = (si + 1) % stops.length; a.idleT = 8; g.npc.sendTo(a, stops[si]); }
          },
        });
        this.tempAgents = [postman];
        return {
          title: '4 · Il postino', reward: 20,
          brief: `Il postino di ${this.village(pl.x, pl.z)}, Renzo Callegaro, consegna buste senza mittente. Sospettiamo che lavori per una società segreta rivale: i Templari del Radicchio.\n\nTrovalo vicino all'ufficio postale (giacca gialla) e pedinalo per 60 secondi. Resta entro 40 metri, ma non avvicinarti a meno di 3 metri o ti scoprirà.`,
          steps: [
            this.S_goto({ text: 'Trova il postino (giacca gialla).', label: 'Postino', r: 35, pos: () => ({ x: postman.x, y: postman.y + 2, z: postman.z }) }),
            this.S_follow({ text: 'Pedina il postino senza farti scoprire.', agent: postman, duration: 60, maxD: 40, minD: 3, label: 'Postino' }),
          ],
          cleanup: () => { for (const x of this.tempAgents || []) g.npc.removeAgent(x); this.tempAgents = null; },
        };
      }
      case 4: {
        const th = this.poi((p) => p.t === 'townhall' && /Rovolon/.test(p.n || '')) || this.poi((p) => p.t === 'townhall', spawn) || this.poi((p) => p.t === 'place_of_worship', spawn);
        const rec = W.buildingAt(th.x, th.z);
        let spot = rec ? g.npc.parkSpot(rec) : null;
        if (!spot) spot = { x: th.x + 6, z: th.z + 6, yaw: 0 };
        const car = g.npc.addParked(spot, '#0d0d10');
        car.special = 'auto nera';
        this.tempCar = car;
        return {
          title: "5 · L'auto nera", reward: 20,
          brief: `Davanti al ${th.n || 'Municipio'} è parcheggiata da giorni un'auto nera con i vetri oscurati. Nessuno in paese sa di chi sia.\n\nVola fin là e scatta una foto all'auto con la fotocamera spia (Q). Avvicinati abbastanza: la foto deve essere nitida (entro 25 m, usa lo zoom con la rotella).`,
          steps: [
            this.S_goto({ text: `Raggiungi il ${th.n || 'Municipio'}.`, label: th.n || 'Municipio', r: 60, pos: () => ({ x: car.x, y: car.y + 2, z: car.z }) }),
            this.S_photo({ text: "Fotografa l'auto nera.", label: 'Auto nera', pos: () => ({ x: car.x, y: car.y + 0.9, z: car.z }) }),
          ],
        };
      }
      case 5: {
        const th = this.poi((p) => p.t === 'townhall' && /Rovolon/.test(p.n || '')) || this.poi((p) => p.t === 'townhall', spawn) || spawn;
        const places = [g.npc.placeAt(th.x, th.z, 'Municipio', 'town', false, 6)];
        const ch = this.poi((p) => p.t === 'place_of_worship', th);
        if (ch) places.push(g.npc.placeAt(ch.x, ch.z, ch.n, 'church', false, 8));
        const br = this.poi((p) => ['bar', 'cafe', 'restaurant'].includes(p.t) && p.n, th);
        if (br) places.push(g.npc.placeAt(br.x, br.z, br.n, 'bar', false, 5));
        let k = 0;
        const geo = g.npc.addSpecial({
          first: 'Ottavio', last: 'Rampazzo', title: 'il geometra', place: places[0], alwaysShow: true, speed: 1.1, noTalk: true,
          colors: { shirt: '#3d424d', pants: '#2b2e33', hair: '#6b6b6b' },
          update: (a) => { if (a.state === 'idle' && a.idleT < 1) { k = (k + 1) % places.length; a.idleT = 20; g.npc.sendTo(a, places[k]); } },
        });
        this.tempAgents = [geo];
        return {
          title: '6 · Il marchio', reward: 20,
          brief: `Il geometra Ottavio Rampazzo gira sempre con una valigetta tra il Municipio, la chiesa e il bar di ${this.village(th.x, th.z)}. Dobbiamo poterlo riconoscere dall'alto.\n\nMarcalo nel modo più… naturale per un piccione: volagli sopra e fagli i tuoi bisogni addosso (F). Completo grigio, capelli brizzolati.`,
          steps: [
            this.S_goto({ text: 'Trova il geometra Rampazzo (completo grigio).', label: 'Geometra', r: 35, pos: () => ({ x: geo.x, y: geo.y + 2, z: geo.z }) }),
            this.S_poop({ text: 'Colpisci il geometra con i tuoi bisogni (F).', ref: geo, label: 'Geometra' }),
          ],
          cleanup: () => { for (const x of this.tempAgents || []) g.npc.removeAgent(x); this.tempAgents = null; },
        };
      }
      case 6: {
        const pk = this.poi((p) => p.t === 'peak' && /Madonna/.test(p.n || '')) || this.poi((p) => p.t === 'peak', spawn);
        const san = this.poi((p) => p.t === 'place_of_worship' && /Madonna/.test(p.n || ''), pk) || pk;
        // antenna misteriosa vicino alla vetta
        let ax = pk.x + 12, az = pk.z - 8;
        for (let k = 0; k < 20 && W.buildingAt(ax, az); k++) { ax += 4; az += 3; }
        const ay = W.terrain.heightAt(ax, az);
        const ant = this.makeAntenna();
        ant.position.set(ax, ay, az);
        g.scene.add(ant);
        this.props.push(ant);
        return {
          title: '7 · Sui colli', reward: 25,
          brief: `Gli abitanti parlano di luci strane sul ${pk.n} (${pk.e || 520} m), vicino al ${san.n || 'santuario'}.\n\nVola fino in vetta — è alta, controlla la batteria! — e fotografa la misteriosa antenna con la luce rossa.`,
          steps: [
            this.S_goto({ text: `Vola sulla vetta del ${pk.n}.`, label: pk.n, r: 90, pos: () => ({ x: ax, y: ay + 15, z: az }) }),
            this.S_photo({ text: "Fotografa l'antenna misteriosa.", label: 'Antenna', maxD: 45, pos: () => ({ x: ax, y: ay + 8, z: az }) }),
          ],
          cleanup: () => { g.scene.remove(ant); this.props = this.props.filter((p) => p !== ant); },
        };
      }
      case 7: {
        const ch = this.poi((p) => p.t === 'place_of_worship' && /Giovanni/.test(p.n || ''), spawn) || this.poi((p) => p.t === 'place_of_worship', spawn);
        const pl = g.npc.placeAt(ch.x, ch.z, ch.n, 'church', false, 4);
        let hooded = [];
        const spawnMeeting = () => {
          if (hooded.length) return;
          const mk = (first, last, robe) => g.npc.addSpecial({ first, last, place: pl, topic: 'illuminati', talkCD: 0, alwaysShow: true, hood: true, colors: { shirt: robe, pants: robe, hair: robe } });
          hooded = [mk('Gran', 'Cappuccio', '#7a1020'), mk('Fratello', 'Uno', '#1c1c24'), mk('Sorella', 'Due', '#1c1c24')];
          for (const h of hooded) h.special.hood = true;
          this.tempAgents = hooded;
        };
        return {
          title: '8 · La riunione segreta', reward: 40, chapterEnd: true,
          brief: `Ci siamo, P-77. Stanotte, sul sagrato della ${ch.n}, si riunirà una loggia rivale.\n\nAspetta che faccia buio (dopo le 21:00), raggiungi la chiesa, ascolta la loro conversazione e fotografa il loro capo: il Gran Cappuccio, quello con la tunica rossa.`,
          steps: [
            this.S_wait({ text: 'Aspetta la notte (dalle 21:00).', from: 21, to: 4.5 }),
            { ...this.S_goto({ text: `Raggiungi il sagrato della ${ch.n}.`, label: 'Riunione', r: 45, pos: () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z }) }), enter: spawnMeeting },
            this.S_listen({ text: 'Ascolta la riunione segreta.', topic: 'illuminati', r: 45, label: 'Riunione', pos: () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z }) }),
            this.S_photo({ text: 'Fotografa il Gran Cappuccio (tunica rossa).', label: 'Gran Cappuccio', maxD: 22, pos: () => ({ x: hooded[0]?.x ?? pl.x, y: (hooded[0]?.y ?? 0) + 1.2, z: hooded[0]?.z ?? pl.z }) }),
          ],
          cleanup: () => { for (const x of this.tempAgents || []) g.npc.removeAgent(x); this.tempAgents = null; },
        };
      }
      case 8: {
        const pw = g.data.power;
        let best = null;
        for (const l of pw.lines) for (let i = 0; i + 3 < l.p.length; i += 2) {
          const x = (l.p[i] + l.p[i + 2]) / 2, z = (l.p[i + 1] + l.p[i + 3]) / 2;
          const d = Math.hypot(x - spawn.x, z - spawn.z);
          if (!best || d < best.d) best = { x, z, d, big: l.big };
        }
        const pos = () => ({ x: best.x, y: W.terrain.heightAt(best.x, best.z) + (best.big ? 20 : 8), z: best.z });
        return {
          title: '9 · Sul filo', reward: 15, chapter: 2,
          brief: `Capitolo 2 · Operazione Fili Scoperti.\n\nLa loggia del Gran Cappuccio comunica attraverso la linea elettrica che attraversa la campagna di ${this.village(best.x, best.z)}. Il tuo becco è un'antenna perfetta.\n\nPosati su un filo dell'elettricità e resta in ascolto per 15 secondi senza volare via.`,
          steps: [this.S_perch({ text: 'Posati su un filo elettrico e resta lì 15 secondi.', kinds: ['wire'], duration: 15, label: 'Linea elettrica', pos })],
        };
      }
      case 9: {
        const sh = (g.data.furniture || []).filter((f) => f.t === 'shrine').sort((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z) - Math.hypot(b.x - spawn.x, b.z - spawn.z))[0] || { x: spawn.x + 20, z: spawn.z };
        const pos = () => ({ x: sh.x, y: W.terrain.heightAt(sh.x, sh.z) + 1.4, z: sh.z });
        return {
          title: '10 · Il capitello', reward: 20, chapter: 2,
          brief: `Nei Colli Euganei i capitelli votivi sono ovunque. Quello ${sh.n ? '"' + sh.n + '" ' : ''}in ${this.streetName(sh.x, sh.z)} (${this.village(sh.x, sh.z)}) nasconde un messaggio cifrato inciso nella nicchia.\n\nFotografalo da vicino.`,
          steps: [this.S_photo({ text: 'Fotografa il capitello votivo.', label: 'Capitello', maxD: 18, pos })],
        };
      }
      case 10: {
        const bs = (g.data.furniture || []).filter((f) => f.t === 'bus').sort((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z) - Math.hypot(b.x - spawn.x, b.z - spawn.z))[0] || spawn;
        const pl = g.npc.placeAt(bs.x, bs.z, 'fermata', 'bus', false, 3);
        const a = g.npc.addSpecial({ first: 'Silvano', last: 'Furlan', place: pl, topic: 'illuminati', talkCD: 1, alwaysShow: true });
        const b = g.npc.addSpecial({ first: 'Loredana', last: 'Bettio', gender: 'f', place: pl, topic: 'illuminati', talkCD: 0, alwaysShow: true });
        this.tempAgents = [a, b];
        const pos = () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z });
        return {
          title: '11 · La fermata della corriera', reward: 20, chapter: 2,
          brief: `Alla fermata dell'autobus ${bs.n ? '"' + bs.n + '"' : 'in ' + this.streetName(bs.x, bs.z)} due pendolari aspettano la corriera e parlano di cose strane.\n\nAscolta la loro conversazione.`,
          steps: [this.S_listen({ text: 'Ascolta i pendolari alla fermata.', topic: 'illuminati', r: 40, label: 'Fermata bus', pos })],
          cleanup: () => { for (const x of this.tempAgents || []) g.npc.removeAgent(x); this.tempAgents = null; },
        };
      }
      case 11: {
        const cand = W.buildings.filter((b) => b.k === 'silo').concat(W.buildings.filter((b) => b.k === 'tower' && Math.hypot(b.c[0] - spawn.x, b.c[1] - spawn.z) > 300));
        const t = cand.sort((a, b) => Math.hypot(a.c[0] - spawn.x, a.c[1] - spawn.z) - Math.hypot(b.c[0] - spawn.x, b.c[1] - spawn.z))[0];
        return {
          title: '12 · Il punto più alto', reward: 20, chapter: 2,
          brief: `Per intercettare le comunicazioni serve un punto alto. ${t.k === 'silo' ? 'Il silos' : 'Il campanile'} in ${this.streetName(t.c[0], t.c[1])} (${this.village(t.c[0], t.c[1])}) è perfetto.\n\nPosati in cima.`,
          steps: [this.S_goto({ text: `Posati in cima al ${t.k === 'silo' ? 'silos' : 'campanile'}.`, label: t.k === 'silo' ? 'Silos' : 'Campanile', building: t, pos: () => ({ x: t.c[0], y: t.top + 1, z: t.c[1] }) })],
        };
      }
      case 12: {
        const pools = g.data.pools || [];
        const cen = (p) => { let x = 0, z = 0; for (let i = 0; i < p.length; i += 2) { x += p[i]; z += p[i + 1]; } return [x / (p.length / 2), z / (p.length / 2)]; };
        const pc = pools.map(cen).sort((a, b) => Math.hypot(a[0] - spawn.x, a[1] - spawn.z) - Math.hypot(b[0] - spawn.x, b[1] - spawn.z))[0] || [spawn.x, spawn.z];
        const pos = () => ({ x: pc[0], y: W.terrain.heightAt(pc[0], pc[1]) + 0.3, z: pc[1] });
        return {
          title: '13 · La piscina della villa', reward: 20, chapter: 2,
          brief: `Una villa in ${this.streetName(pc[0], pc[1])} ospita feste esclusive a bordo piscina. Gli Illuminati vogliono sapere chi ci va.\n\nFotografa la piscina dall'alto.`,
          steps: [this.S_photo({ text: 'Fotografa la piscina della villa.', label: 'Piscina', maxD: 45, pos })],
        };
      }
      case 13: {
        const th = this.poi((p) => p.t === 'townhall' && /Rovolon/.test(p.n || '')) || this.poi((p) => p.t === 'townhall', spawn) || spawn;
        const rec = W.buildingAt(th.x, th.z);
        const spot = (rec && g.npc.parkSpot(rec)) || { x: th.x + 6, z: th.z + 6, yaw: 0 };
        const car = g.npc.addParked(spot, '#0d0d10');
        car.special = 'auto nera';
        return {
          title: '14 · La cimice', reward: 25, chapter: 2,
          brief: "L'auto nera è tornata davanti al Municipio. Stavolta non basta una foto: avvicinati e piazza una cimice sotto il paraurti (tasto E quando sei accanto all'auto).",
          steps: [this.S_bug({ text: "Piazza la cimice sull'auto nera (E).", ref: car, label: 'Auto nera' })],
        };
      }
      case 14: {
        const ch = this.poi((p) => p.t === 'place_of_worship', spawn) || spawn;
        const cr = (g.data.furniture || []).filter((f) => f.t === 'crossing').sort((a, b) => Math.hypot(a.x - ch.x, a.z - ch.z) - Math.hypot(b.x - ch.x, b.z - ch.z))[0] || ch;
        const pos = () => ({ x: cr.x, y: W.terrain.heightAt(cr.x, cr.z) + 0.3, z: cr.z });
        return {
          title: '15 · Il segnale', reward: 20, chapter: 2,
          brief: `Per segnalare ai nostri agenti che la cimice è attiva serve un segno concordato: una "firma" di piccione sulle strisce pedonali in ${this.streetName(cr.x, cr.z)}.\n\nColpisci le strisce dall'alto (F).`,
          steps: [this.S_poopAt({ text: 'Colpisci le strisce pedonali con i tuoi bisogni.', label: 'Strisce pedonali', r: 3.5, pos })],
        };
      }
      case 15: {
        const pk = this.poi((p) => p.t === 'peak' && /Grande/.test(p.n || '')) || this.poi((p) => p.t === 'peak', spawn);
        const ch = this.poi((p) => p.t === 'place_of_worship' && /Giovanni/.test(p.n || ''), spawn) || this.poi((p) => p.t === 'place_of_worship', spawn);
        const rec = W.buildingsNear(ch.x, ch.z, 45).find((b) => b.k === 'tower') || W.buildingAt(ch.x, ch.z);
        return {
          title: '16 · Fuga dal falco', reward: 50, chapter: 2, final: true,
          brief: `La loggia ha addestrato un falco. Recupera il microfilm nascosto sulla vetta del ${pk.n} e riportalo al campanile di Carbonara entro 150 secondi.\n\nSe il falco ti punta, rifugiati sotto una tettoia o tra gli alberi!`,
          steps: [
            this.S_goto({ text: `Vola sulla vetta del ${pk.n} a prendere il microfilm.`, label: pk.n, r: 60, pos: () => ({ x: pk.x, y: W.terrain.heightAt(pk.x, pk.z) + 5, z: pk.z }) }),
            this.S_timed({ text: 'Riporta il microfilm al campanile di Carbonara!', label: 'Campanile', time: 150, building: rec, pos: () => ({ x: rec.c[0], y: rec.top + 1, z: rec.c[1] }), onEnter: () => g.animals?.forceHawk(), onFail: () => g.animals?.forceHawk() }),
          ],
        };
      }
      default: return null;
    }
  }

  makeAntenna() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 14, 6), m);
    mast.position.y = 7;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshLambertMaterial({ color: 0xe8e8e8, side: THREE.DoubleSide }));
    dish.position.set(0, 10, 0.4);
    dish.rotation.x = -1.1;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    light.position.y = 14.3;
    const eye = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 3), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    eye.position.y = 12;
    g.add(mast, dish, light, eye);
    g.userData.light = light;
    return g;
  }

  // ------------------------------------------------------------ procedurali
  procedural() {
    const g = this.g;
    const pg = g.pigeon.pos;
    const r = this.rnd;
    const near = (list, maxD) => list.filter((p) => Math.hypot(p.x - pg.x, p.z - pg.z) < maxD);
    const named = near(g.data.pois.filter((p) => p.n && p.b && !p.t.startsWith('place') && p.t !== 'peak'), 1600);
    const types = ['listen', 'listen', 'photoNpc', 'photoPlace', 'poopCar', 'poopCar', 'follow', 'steal', 'roof', 'roof', 'wire', 'bug', 'crossing'];
    const type = types[Math.floor(r() * types.length)];
    const n = this.state.proc + 1;
    const reward = 15 + Math.floor(r() * 15);
    const T = (s) => `Missione ${n} · ${s}`;
    if (type === 'listen') {
      const pl = named.length ? named[Math.floor(r() * named.length)] : null;
      const topics = ['vino', 'calcio', 'pettegolezzi', 'piccioni', 'meteo', 'colli', 'illuminati', 'soldi', 'famiglia'];
      const topic = topics[Math.floor(r() * topics.length)];
      if (pl) {
        const pos = () => ({ x: pl.x, y: this.groundY(pl.x, pl.z) + 3, z: pl.z });
        return {
          title: T('Orecchie aperte'), reward, brief: `Si mormora qualcosa su ${TOPIC_LABEL[topic]} vicino a "${pl.n}" (${this.village(pl.x, pl.z)}). Vai ad ascoltare.`,
          steps: [
            this.S_goto({ text: `Raggiungi "${pl.n}".`, label: pl.n, r: 50, pos }),
            this.S_listen({ text: `Ascolta una conversazione su ${TOPIC_LABEL[topic]}.`, topic, r: 60, label: pl.n, pos, bias: { x: pl.x, z: pl.z, r: 70, topic, p: 0.7 } }),
          ],
        };
      }
    }
    if (type === 'photoNpc') {
      const cand = g.npc.visiblePeople().filter((a) => a.role !== 'child' && !a.special && Math.hypot(a.x - pg.x, a.z - pg.z) < 600);
      if (cand.length) {
        const a = cand[Math.floor(r() * cand.length)];
        const job = { shopkeeper: `che lavora a "${a.work?.name}"`, elder: 'pensionato/a', farmer: 'agricoltore', adult: 'residente', }[a.role] || '';
        return {
          title: T('Ritratto segreto'), reward, brief: `Ci serve una foto di ${a.first} ${a.last}, ${job}, che abita in ${a.home.d.st || 'zona'}. È stato/a visto/a vicino a te.`,
          steps: [this.S_photo({ text: `Fotografa ${a.first} ${a.last}.`, label: a.first + ' ' + a.last, maxD: 22, pos: () => ({ x: a.x, y: a.y + 1.4 * a.scale, z: a.z }) })],
        };
      }
    }
    if (type === 'photoPlace' && named.length) {
      const pl = named[Math.floor(r() * named.length)];
      const rec = g.world.buildingAt(pl.x, pl.z);
      const y = rec ? (rec.ground + rec.eave) / 2 : this.groundY(pl.x, pl.z) + 3;
      return {
        title: T('Sopralluogo'), reward, brief: `Gli archivi degli Illuminati vogliono una foto aggiornata di "${pl.n}" a ${this.village(pl.x, pl.z)}.`,
        steps: [this.S_photo({ text: `Fotografa "${pl.n}".`, label: pl.n, maxD: 70, pos: () => ({ x: pl.x, y, z: pl.z }) })],
      };
    }
    if (type === 'poopCar') {
      const cars = g.npc.parked.filter((c) => !c.stained && Math.hypot(c.x - pg.x, c.z - pg.z) < 500 && Math.hypot(c.x - pg.x, c.z - pg.z) > 40);
      if (cars.length) {
        const c = cars[Math.floor(r() * cars.length)];
        return {
          title: T("Segna l'auto"), reward, brief: `L'auto ${colorName(c.color)} parcheggiata in ${this.streetName(c.x, c.z)} appartiene a un informatore. Marcala dall'alto (F) così i nostri agenti la riconosceranno.`,
          steps: [this.S_poop({ text: `Colpisci l'auto ${colorName(c.color)} in ${this.streetName(c.x, c.z)}.`, ref: c, label: 'Auto ' + colorName(c.color) })],
        };
      }
    }
    if (type === 'follow') {
      const cand = g.npc.agents.filter((a) => a.state === 'walk' && a.role !== 'child' && !a.special && a.path && a.path.segs.length > 6 && Math.hypot(a.x - pg.x, a.z - pg.z) < 400);
      if (cand.length) {
        const a = cand[Math.floor(r() * cand.length)];
        return {
          title: T('Pedinamento'), reward, brief: `${a.first} ${a.last} si sta muovendo verso "${a.dest?.name || 'un posto'}". Seguilo/a per 40 secondi senza farti notare.`,
          steps: [
            this.S_goto({ text: `Raggiungi ${a.first} ${a.last}.`, label: a.first, r: 35, pos: () => ({ x: a.x, y: a.y + 2, z: a.z }) }),
            this.S_follow({ text: `Pedina ${a.first} ${a.last}.`, agent: a, duration: 40, maxD: 40, minD: 2.5, label: a.first }),
          ],
        };
      }
    }
    if (type === 'wire') {
      let best = null;
      for (const l of g.data.power.lines) for (let i = 0; i + 3 < l.p.length; i += 2) {
        const x = (l.p[i] + l.p[i + 2]) / 2, z = (l.p[i + 1] + l.p[i + 3]) / 2, d = Math.hypot(x - pg.x, z - pg.z);
        if (d < 1500 && (!best || r() < 0.3)) best = { x, z, big: l.big };
      }
      if (best) return { title: T('In ascolto sul filo'), reward, brief: `Intercetta le comunicazioni sulla linea elettrica vicino a ${this.village(best.x, best.z)}: posati su un filo per 12 secondi.`, steps: [this.S_perch({ text: 'Posati su un filo elettrico per 12 secondi.', kinds: ['wire'], duration: 12, label: 'Linea elettrica', pos: () => ({ x: best.x, y: g.world.terrain.heightAt(best.x, best.z) + (best.big ? 20 : 8), z: best.z }) })] };
    }
    if (type === 'bug') {
      const cars = g.npc.parked.filter((c) => Math.hypot(c.x - pg.x, c.z - pg.z) < 500 && Math.hypot(c.x - pg.x, c.z - pg.z) > 40);
      if (cars.length) {
        const c = cars[Math.floor(r() * cars.length)];
        return { title: T('Cimice'), reward, brief: `Piazza una cimice sull'auto ${colorName(c.color)} parcheggiata in ${this.streetName(c.x, c.z)}.`, steps: [this.S_bug({ text: `Piazza la cimice sull'auto ${colorName(c.color)} (E).`, ref: c, label: 'Auto ' + colorName(c.color) })] };
      }
    }
    if (type === 'crossing') {
      const cr = (g.data.furniture || []).filter((f) => f.t === 'crossing' && Math.hypot(f.x - pg.x, f.z - pg.z) < 1500);
      if (cr.length) {
        const c = cr[Math.floor(r() * cr.length)];
        return { title: T('Firma sulle strisce'), reward, brief: `Lascia il segnale concordato sulle strisce pedonali in ${this.streetName(c.x, c.z)}.`, steps: [this.S_poopAt({ text: 'Colpisci le strisce pedonali (F).', label: 'Strisce', r: 3.5, pos: () => ({ x: c.x, y: g.world.terrain.heightAt(c.x, c.z) + 0.3, z: c.z }) })] };
      }
    }
    if (type === 'steal') {
      const k = 2 + Math.floor(r() * 2);
      return { title: T('Scorte di energia'), reward: 5, brief: `La base ha bisogno di energia. Ruba ${k} batterie.`, steps: [this.S_steal({ text: `Ruba ${k} batterie.`, count: k })] };
    }
    // atterraggio su un tetto
    const pl = named.length ? named[Math.floor(r() * named.length)] : null;
    const rec = pl ? g.world.buildingAt(pl.x, pl.z) : null;
    if (rec) {
      return {
        title: T('Punto di osservazione'), reward, brief: `Stabilisci un punto di osservazione sul tetto di "${pl.n}" (${this.village(pl.x, pl.z)}).`,
        steps: [this.S_goto({ text: `Posati sul tetto di "${pl.n}".`, label: pl.n, building: rec, pos: () => ({ x: rec.c[0], y: rec.top + 1, z: rec.c[1] }) })],
      };
    }
    return { title: T('Scorte di energia'), reward: 5, brief: 'Ruba 2 batterie.', steps: [this.S_steal({ text: 'Ruba 2 batterie.', count: 2 })] };
  }

  // ------------------------------------------------------------ ciclo di vita
  start(showBrief = true) {
    const m = this.state.story < STORY_N ? this.story(this.state.story) : this.procedural();
    m.kind = this.state.story < STORY_N ? 'story' : 'proc';
    m.stepIdx = 0;
    this.current = m;
    this.enterStep();
    if (showBrief) this.g.hud.briefing(m.title, m.brief);
  }

  enterStep() {
    const s = this.step;
    if (s?.enter) s.enter();
    this.g.hud.mission(this.current, s);
  }

  get step() { return this.current ? this.current.steps[this.current.stepIdx] : null; }

  advance() {
    const m = this.current;
    const s = this.step;
    s?.leave?.();
    m.stepIdx++;
    this.g.audio?.play('success');
    if (m.stepIdx >= m.steps.length) {
      m.cleanup?.();
      this.state.points += m.reward + 10;
      if (m.reward) this.g.pigeon.battery = Math.min(this.g.pigeon.maxBattery, this.g.pigeon.battery + m.reward);
      this.state.done.push(m.title);
      if (m.kind === 'story') this.state.story++; else this.state.proc++;
      this.g.hud.toast(`Missione completata: ${m.title}` + (m.reward ? ` (+${m.reward}% batteria)` : ''), 'good');
      this.g.save();
      if (m.chapterEnd) {
        this.g.hud.briefing('Capitolo 1 completato!', 'Straordinario, P-77. Le prove raccolte su Carbonara, Bastia e i Colli Euganei hanno smascherato la loggia del Gran Cappuccio.\n\nMa la loggia ha altri canali di comunicazione… Il capitolo 2 sta per cominciare.\n\n(Nel menu di pausa trovi il Laboratorio Illuminati: spendi i Punti per potenziare il piccione.)');
      }
      if (m.final) {
        this.g.hud.briefing('Operazione completata!', 'Missione compiuta, agente P-77! La loggia del Gran Cappuccio è stata smantellata e il comune di Rovolon è di nuovo sotto il nostro sguardo.\n\nDa ora riceverai incarichi procedurali infiniti in tutto il comune.');
        this.g.achieve?.('story');
        this.current = null;
        setTimeout(() => this.start(false), 500);
        return;
      }
      this.current = null;
      setTimeout(() => this.start(true), 2500);
      return;
    }
    this.enterStep();
  }

  update(dt) {
    const s = this.step;
    for (const p of this.props) if (p.userData.light) p.userData.light.visible = Math.floor(performance.now() / 500) % 2 === 0;
    if (!s) return;
    if (s.update && s.update(dt)) this.advance();
    this.progressT = (this.progressT || 0) - dt;
    if (this.progressT <= 0 && this.step) { this.progressT = 0.25; this.g.hud.missionProgress(this.step.progress?.() || ''); }
  }

  event(ev) {
    const s = this.step;
    if (s?.event && s.event(ev)) this.advance();
  }

  targets() {
    const s = this.step;
    return s ? s.targets() : [];
  }

  serialize() { return { ...this.state }; }
  load(st) { if (st) this.state = { ...this.state, ...st }; }
}

export function fmtDist(d) { return d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'; }
