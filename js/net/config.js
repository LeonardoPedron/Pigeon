// Configurazione di rete del multiplayer.
//
// Server TURN: servono quando due giocatori sono dietro reti che non permettono il collegamento
// diretto (tipico delle reti mobili 4G/5G e di alcune reti aziendali). Il traffico passa dal server.
//
// Opzione 1 – Metered "Open Relay" (gratis 20 GB/mese): crea un account su https://www.metered.ca/,
//   nella dashboard crea un'app e una credenziale TURN, poi inserisci il nome dell'app
//   (es. "piccione" per piccione.metered.live) e la chiave API. Le credenziali temporanee vengono
//   scaricate all'avvio della partita. Nota: in un sito statico la chiave è visibile a chi apre il codice.
// Opzione 2 – un tuo server coturn (o altro): elenca gli indirizzi in `turn`.
export const NET_CONFIG = {
  meteredApp: '',
  meteredApiKey: '',
  turn: [
    // { urls: ['turn:turn.example.com:3478?transport=udp', 'turns:turn.example.com:443?transport=tcp'], username: 'utente', credential: 'password' },
  ],
};
