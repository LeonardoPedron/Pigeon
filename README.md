# 🐦🎩 Piccione Spia: Operazione Rovolon

Gioco 3D nel browser (HTML, CSS e JavaScript con three.js). Sei **P-77**, un piccione-robot spia degli Illuminati, nell'intero **comune di Rovolon (PD)**: Carbonara, Rovolon, Bastia e i Colli Euganei, ricostruiti **in scala 1:1** con dati reali.

## Cosa c'è
- **Mondo reale**: 5.555 edifici e 1.816 strade presi da OpenStreetMap, più il terreno reale dei colli (DEM: da 7 m fino al Monte della Madonna, 526 m). Campi, vigneti, boschi, corsi d'acqua, lampioni e targhe dei civici.
- **Il piccione**: cammina, vola, si posa sui tetti e fa i bisogni (le macchie restano). Ha il cappello da spia, l'antenna e l'occhio bionico. La batteria si scarica e si ricarica rubando batterie in paese.
- **Abitanti**: 300–700 persone con una routine giornaliera sulle strade reali. Ci sono negozianti nei negozi e bar veri, bambini a scuola, pensionati al bar e in chiesa, contadini nei campi, auto dei pendolari e traffico. Parlano tra loro con dialoghi procedurali in italiano con espressioni venete. Le persone sono inventate.
- **Missioni**: la campagna "Operazione Occhio di Colombo" (8 missioni), poi missioni procedurali infinite. Si ascoltano conversazioni, si scattano foto con la fotocamera spia, si pedina, si ruba e si "marca" dall'alto.
- **Mappa** (tasto M): mappa OpenStreetMap del comune con nomi delle vie, civici (in corsivo quelli stimati), luoghi, confine comunale e posizione del piccione in tempo reale. In basso a destra c'è la minimappa.
- Ciclo giorno/notte (1 ora di gioco = 1 minuto), finestre illuminate di notte, campane, audio sintetizzato, salvataggio automatico. Funziona su PC e su mobile con comandi touch.

## Comandi
WASD/frecce per muoversi · mouse per la visuale · Spazio per decollare/salire · C per scendere · Shift per il turbo · F per i bisogni · E per rubare · Q per la fotocamera (clic o Invio per scattare) · V per tubare · M per la mappa · T (tenuto premuto) per accelerare il tempo · P/Esc per la pausa.

## Limiti dei dati
OSM contiene le piante degli edifici ma quasi mai altezze e forma dei tetti: altezza e tetto sono stimati in base al tipo e ai piani. In OSM ci sono solo 83 civici reali. Gli altri 2.507 sono **stimati** lungo la via più vicina (numeri dispari da un lato, pari dall'altro) e nella mappa sono segnati in corsivo.

## Sviluppo
```bash
npm install
npm run fetch        # scarica OSM (api.openstreetmap.org) e DEM Terrarium in data/raw/
npm run build-data   # genera data/world.json e data/height.bin
npm run vendor       # copia three.js, Leaflet ed earcut in js/vendor/
npm run serve        # http://localhost:8080
npm test             # test end-to-end con Playwright (gioca tutta la campagna)
```

## Pubblicazione
Il workflow `.github/workflows/pages.yml` pubblica il sito su GitHub Pages a ogni push su `main`. Per attivarlo vai in Settings → Pages → Source: **GitHub Actions**.

## Crediti
Dati © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Altimetria: Terrarium / AWS Open Data (SRTM, EU-DEM). Librerie: three.js, Leaflet ed earcut (licenze MIT/BSD/ISC).

## Multiplayer: chi è la spia?
Nella schermata iniziale attiva **🌐 Multiplayer**, scegli un nome e una stanza. Puoi anche condividere un link con `?room=nome`. Tutti quelli nella stessa stanza si vedono come piccioni nella mappa, con il nome sopra la testa. La connessione è **P2P (WebRTC)**: la segnalazione passa per relay Nostr pubblici tramite [Trystero](https://github.com/dmotz/trystero), quindi funziona su GitHub Pages senza server.

- **Ruoli segreti**: circa 1 giocatore su 4 è una **spia-robot** degli Illuminati. Gioca la campagna, ruba batterie e prende +5 punti al minuto finché non viene scoperta. Gli altri sono **piccioni veri**: niente batteria né missioni, devono smascherare le spie. In giro ci sono anche ~20 **piccioni comuni** controllati dal computer, con un nome come i giocatori, per confondere.
- **Indizi** (dossier col tasto J):
  - chi viene visto rubare una batteria (scintilla verde);
  - l'occhio bionico che di notte lampeggia rosso da vicino;
  - il tubare metallico;
  - le **scansioni elettroniche**: tieni premuto R su un piccione, meglio con la fotocamera Q e lo zoom.
- **Accusa** (X su un piccione entro 10 m): se è una spia +100 punti, e la spia viene smascherata col cappello in testa per 30 s, poi rinasce con un nuovo ruolo. Se è un piccione vero −40 punti e un minuto senza accuse.
- I ruoli sono garantiti con **commit-reveal**: all'ingresso ognuno pubblica solo `SHA-256(ruolo|sale)` e, se accusato, lo rivela. Chi mente viene marcato 🚫.
- Altri comandi: 1–4 emote, G spinge un piccione vicino, Tab classifica, V tuba (lo sentono tutti). Su mobile ci sono i pulsanti del pannello multiplayer.

Per provarlo in locale su più schede dello stesso browser senza rete: `http://localhost:8080/?net=local&room=prova`.
Test: `node tests/mp.mjs`. Per rigenerare il bundle di Trystero: `node scripts/vendor-net.mjs`.
