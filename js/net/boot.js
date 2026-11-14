// Avvio del multiplayer. Caricato da index.html dopo main.js: aggiunge le opzioni nella
// schermata iniziale e, quando la partita parte, collega il modulo multiplayer al gioco.
// Attivazione: casella "Multiplayer" nella schermata iniziale, oppure ?room=nome (P2P) / ?net=local (stesso browser).
const params = new URLSearchParams(location.search);
const PREF_KEY = 'piccioneSpia.mp.v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; } };
const lsSet = (v) => { try { localStorage.setItem(PREF_KEY, JSON.stringify(v)); } catch { /* ignore */ } };

const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = 'css/multiplayer.css';
document.head.appendChild(css);

const NAMES = ['Gigio', 'Tobia', 'Nane', 'Bepi', 'Rina', 'Piuma', 'Grigio', 'Checco', 'Lalla', 'Zeno', 'Bruna', 'Dino'];
const pref = lsGet();
const urlRoom = params.get('room');
const net = params.get('net') === 'local' ? 'local' : 'p2p';
const state = {
  on: !!urlRoom || net === 'local' || !!pref.on,
  name: params.get('name') || pref.name || NAMES[Math.floor(Math.random() * NAMES.length)] + Math.floor(10 + Math.random() * 89),
  room: (urlRoom || pref.room || 'rovolon').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'rovolon',
};

function injectStartUI() {
  const host = document.getElementById('startButtons');
  if (!host || document.getElementById('mpStart')) return;
  const box = document.createElement('div');
  box.id = 'mpStart';
  box.innerHTML = `
    <label class="mp-toggle"><input type="checkbox" id="mpOn"> 🌐 <b>Multiplayer</b>: chi è la spia?</label>
    <div class="mp-fields">
      <label>Nome <input id="mpName" maxlength="18" autocomplete="off"></label>
      <label>Stanza <input id="mpRoom" maxlength="24" autocomplete="off"></label>
    </div>
    <p class="mp-note">Entri nella stanza insieme ad altri giocatori: tutti sono piccioni, ma alcuni sono spie-robot. Condividi il link con <code>?room=nome</code> per giocare con gli amici.</p>`;
  host.insertBefore(box, host.firstChild);
  const on = box.querySelector('#mpOn'), nm = box.querySelector('#mpName'), rm = box.querySelector('#mpRoom');
  on.checked = state.on; nm.value = state.name; rm.value = state.room;
  const sync = () => {
    state.on = on.checked;
    state.name = nm.value.trim().slice(0, 18) || state.name;
    state.room = rm.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'rovolon';
    box.classList.toggle('off', !state.on);
    lsSet({ on: state.on, name: state.name, room: state.room });
  };
  for (const el of [on, nm, rm]) { el.addEventListener('change', sync); el.addEventListener('keydown', (e) => e.stopPropagation()); }
  box.classList.toggle('off', !state.on);
}

async function launch(game) {
  const { Multiplayer } = await import('./multiplayer.js');
  const forced = net === 'local' ? params.get('role') : null; // solo per i test in locale
  const mp = new Multiplayer(game, { room: state.room, name: state.name, net, forceRole: forced === 'spia' || forced === 'vero' ? forced : null });
  window.__mp = mp;
  const tick = game.tick.bind(game);
  game.tick = (dt) => {
    tick(dt);
    try { mp.update(dt); } catch (e) { console.error('[mp]', e); }
  };
  try {
    await mp.start();
  } catch (e) {
    console.error('[mp]', e);
    game.hud?.toast?.('🌐 Multiplayer non disponibile: ' + e.message, 'bad');
  }
}

injectStartUI();
const wait = setInterval(() => {
  const game = window.__game;
  if (!document.getElementById('mpStart')) injectStartUI();
  if (!game?.running) return;
  clearInterval(wait);
  if (state.on) launch(game);
}, 100);
