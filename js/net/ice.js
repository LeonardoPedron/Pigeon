// Raccoglie i server TURN da usare per WebRTC: configurazione statica, credenziali Metered
// scaricate a runtime (con cache per la sessione) e override da URL per le prove (?turn=...&tu=...&tc=...).
import { NET_CONFIG } from './config.js';

const CACHE_KEY = 'piccioneSpia.turn.v1';

function fromUrl() {
  const p = new URLSearchParams(location.search);
  const u = p.get('turn');
  if (!u) return [];
  return [{ urls: u.split(','), username: p.get('tu') || undefined, credential: p.get('tc') || undefined }];
}

async function fromMetered(cfg) {
  if (!cfg.meteredApp || !cfg.meteredApiKey) return [];
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (c && Date.now() - c.t < 6 * 3600e3) return c.servers;
  } catch { /* ignore */ }
  const app = cfg.meteredApp.replace(/\.metered\.live$/, '');
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://${app}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(cfg.meteredApiKey)}`, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = await r.json();
    // solo i TURN: gli STUN pubblici li aggiunge già Trystero
    const servers = (Array.isArray(list) ? list : []).filter((s) => [].concat(s.urls || s.url || []).some((u) => /^turns?:/.test(u)))
      .map((s) => ({ urls: s.urls || s.url, username: s.username, credential: s.credential }));
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), servers })); } catch { /* ignore */ }
    return servers;
  } catch (e) {
    console.warn('[mp] credenziali TURN Metered non disponibili:', e.message);
    return [];
  } finally { clearTimeout(to); }
}

export async function turnServers(cfg = NET_CONFIG) {
  const list = [...fromUrl(), ...(cfg.turn || []), ...(await fromMetered(cfg))];
  return list.filter((s) => s && s.urls && [].concat(s.urls).length);
}
