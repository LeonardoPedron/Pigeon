# 🐦🎩 Piccione Spia: Operazione Rovolon

Gioco 3D nel browser (HTML, CSS e JavaScript con three.js). Sei **P-77**, un piccione-robot spia degli Illuminati, nell'intero **comune di Rovolon (PD)**: Carbonara, Rovolon, Bastia e i Colli Euganei, ricostruiti **in scala 1:1** con dati reali.

## Novità della versione 2
- **Edifici distinti e più completi**: tipologia e uso ufficiali dal DBT/Carta Tecnica della **Regione del Veneto** (layer `edifici_veneto_feb2022`), abbinati alle impronte OSM. Ci sono **698 edifici in più** che mancavano in OSM (allineati correggendo lo scostamento medio di circa 1,9 m tra DBT e OSM) e 18 tipi diversi: casa veneta, villa, condominio con balconi, casa colonica, annesso agricolo con archi, capannone, garage, baracca, tettoia su pilastri, serra, chiesa in pietra con rosone, campanile con cella campanaria e orologio, scuola, rudere, silos. Le facciate hanno campate e piani veri, sporti di gronda e comignoli, e i negozi e i bar hanno **insegne con il nome reale**.
- **Dettagli reali da OSM**: 1.209 recinzioni, muri e siepi; linee elettriche con tralicci e fili; 161 lampioni reali; strisce pedonali, stop, fermate bus, capitelli votivi, panchine, fontane, piscine; segnaletica e superfici delle strade; filari 3D nei vigneti.
- **Collisioni con tutto**: muri (anche a 26 m/s), tetti, tettoie (ci si vola sotto), pali, tronchi, recinzioni, auto, persone. Ci si posa su fili elettrici, lampioni, alberi, comignoli, ombrelloni e sul tetto delle auto in corsa, che trasportano il piccione. La camera non entra mai nei muri.
- **Scala reale**: piccione di 32 cm con camera "occhio di piccione"; persone alte da 1,55 a 1,90 m con volto, mani e scarpe.
- **Fotocamera spia**: mirino con telemetro, zoom e aggancio del bersaglio; ogni scatto esce come **Polaroid** che si sviluppa e finisce nell'album.
- **Meteo** (sereno, nuvoloso, pioggia, nebbia), nuvole; **animali**: stormi di piccioni, gatti che ti cacciano a terra, falco che ti caccia in volo, galline.
- **Capitolo 2** della campagna (16 missioni in tutto), nuove missioni procedurali, **Laboratorio Illuminati** con potenziamenti, obiettivi e record.
- Prestazioni: dettaglio degli edifici generato solo vicino al piccione, LOD lontano, ombre a frame alterni, pannello FPS (F3).

## Cosa c'è
- **Mondo reale**: 6.253 edifici (5.555 da OpenStreetMap più 698 presenti solo nel database topografico della Regione del Veneto), 1.816 strade e circa 5.560 numeri civici reali (quasi tutti dall'archivio nazionale ANNCSU). Il terreno dei colli viene dal DTM regionale a 5 m (da 10 m in pianura fino al Monte della Madonna, 526 m). Campi, vigneti, boschi, corsi d'acqua, lampioni e targhe dei civici.
- **Il piccione**: cammina, vola, si posa sui tetti e fa i bisogni (le macchie restano). Ha il cappello da spia, l'antenna e l'occhio bionico. La batteria si scarica e si ricarica rubando batterie in paese.
- **Abitanti**: 300–700 persone con una routine giornaliera sulle strade reali. Ci sono negozianti nei negozi e bar veri, bambini a scuola, pensionati al bar e in chiesa, contadini nei campi, auto dei pendolari e traffico. Parlano tra loro con dialoghi procedurali in italiano con espressioni venete. Le persone sono inventate.
- **Missioni**: la campagna "Operazione Occhio di Colombo" (8 missioni), poi missioni procedurali infinite. Si ascoltano conversazioni, si scattano foto con la fotocamera spia, si pedina, si ruba e si "marca" dall'alto.
- **Mappa** (tasto M): mappa OpenStreetMap del comune con nomi delle vie, civici reali (in corsivo i pochi stimati), luoghi, confine comunale e posizione del piccione in tempo reale. In basso a destra c'è la minimappa.
- Ciclo giorno/notte (1 ora di gioco = 1 minuto), finestre illuminate di notte, campane, audio sintetizzato, salvataggio automatico. Funziona su PC e su mobile con comandi touch.

## Comandi
WASD/frecce per muoversi · mouse per la visuale · Spazio per decollare/salire · C per scendere · Shift per il turbo · F per i bisogni · E per rubare · Q per la fotocamera (clic o Invio per scattare) · V per tubare · M per la mappa · T (tenuto premuto) per accelerare il tempo · P/Esc per la pausa.

## Fonti dei dati
| Dato | Fonte | Licenza | Uso nel gioco |
|---|---|---|---|
| Edifici, strade, aree, POI | OpenStreetMap (API 0.6) | ODbL | base del mondo |
| Edifici DBT/CTRN 1:5000 | Regione del Veneto, IDT (WFS `rv:edifici_veneto_feb2022`) | IODL 2.0 | tipologia e uso di tutti gli edifici e aggiunta di quelli mancanti in OSM, allineati con lo scostamento medio stimato (circa 1,9 m); scaricati da `fetch-ctrn.mjs` |
| Grafo stradale regionale | Regione del Veneto, IDT (WFS `rv:c01070240012_elementostradale`) | IODL 2.0 | nomi ufficiali delle strade senza nome in OSM |
| DTM 5 m (LiDAR dove disponibile) | Regione del Veneto, IDT (WMS `rv:DTM_RV_5m_3003`) | IODL 2.0 | heightmap del terreno (passo 10 m, media dei valori a 5 m) |
| Numeri civici | ANNCSU tramite OpenAddresses `it/countrywide`, letto dal tema *addresses* di Overture Maps | CC-BY 4.0 | civici reali, associati all'edificio che li contiene o al più vicino |
| Altimetria di riserva | Terrarium / AWS Open Data (SRTM, EU-DEM) | pubblico | solo dove manca il DTM regionale |

Il DTM regionale è pubblicato solo come WMS: `fetch-veneto.mjs` lo richiede con uno stile SLD a rampa di grigi su 10 finestre di quota da 64 m, e `build-data.mjs` ricostruisce la quota con 0,25 m di risoluzione.

I nomi delle vie ANNCSU (in maiuscolo) vengono ricondotti alla grafia OSM confrontando i nomi normalizzati, e in seconda battuta con la via OSM più vicina. Se non c'è corrispondenza, il nome viene scritto con iniziali maiuscole e accenti (`FUA'` → `Fuà`).

`world.json` contiene in `stats` i conteggi di ogni fonte. Gli edifici aggiunti dal DBT hanno `src: "ctrn"`, i civici ANNCSU `src: "anncsu"` e le strade con nome regionale `nv: 1`.

## Limiti dei dati
- **Altezze e tetti sono ancora stimati** dal tipo di edificio e dai piani. Il DBT regionale online non ha le quote di gronda, e il DSM LiDAR a 2 m della Regione copre solo l'area di Cortina.
- Il DBT è aggiornato al 2008–2010: alcuni annessi aggiunti potrebbero non esistere più.
- Restano circa 175 civici stimati, sulle vie dove l'ANNCSU non ha numeri. Sono in corsivo nella mappa.
- Non sono integrati, perché il loro sito non era raggiungibile dalla rete usata per la build: catasto (Agenzia delle Entrate), TINITALY (INGV) e basi territoriali ISTAT. Il DTM regionale a 5 m sostituisce comunque TINITALY (10 m).

## Sviluppo
```bash
npm install
pip install pyarrow  # serve solo a fetch-overture.py
npm run fetch        # scarica in data/raw/ OSM, DEM Terrarium, dati Regione Veneto (edifici, strade, DTM) e civici Overture/ANNCSU
                     # (anche separatamente: npm run fetch-osm | fetch-veneto | fetch-overture)
npm run build-data   # genera data/world.json e data/height.bin
npm run vendor       # copia three.js, Leaflet ed earcut in js/vendor/
npm run serve        # http://localhost:8080
npm test             # test end-to-end con Playwright (gioca tutta la campagna)
```

## Pubblicazione
Il workflow `.github/workflows/pages.yml` pubblica il sito su GitHub Pages a ogni push su `main`. Per attivarlo vai in Settings → Pages → Source: **GitHub Actions**.

## Crediti
Dati © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL). Edifici, grafo stradale e DTM 5 m: © Regione del Veneto – Infrastruttura Dati Territoriali (IODL 2.0). Numeri civici: ANNCSU (ISTAT – Agenzia delle Entrate) tramite [OpenAddresses](https://openaddresses.io) e [Overture Maps Foundation](https://overturemaps.org) (CC-BY 4.0). Altimetria di riserva: Terrarium / AWS Open Data (SRTM, EU-DEM). Librerie: three.js, Leaflet, earcut e Trystero (licenze MIT/BSD/ISC).

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

**Reti mobili (server TURN).** Sulle reti 4G/5G spesso i telefoni non riescono a collegarsi direttamente tra loro, e serve un server TURN che inoltri il traffico. Si configura in `js/net/config.js`:
- con [Metered Open Relay](https://www.metered.ca/tools/openrelay/) (account gratuito, 20 GB al mese) bastano il nome dell'app (`meteredApp`) e la chiave API (`meteredApiKey`), e le credenziali vengono scaricate all'avvio;
- oppure elenca il tuo server (ad esempio coturn) in `turn`.

Per una prova al volo puoi usare anche l'URL: `?room=prova&turn=turn:host:3478&tu=utente&tc=password`. Nel pannello multiplayer compare «🔁 TURN» quando è attivo.

Per provarlo in locale su più schede dello stesso browser senza rete: `http://localhost:8080/?net=local&room=prova`.
Test: `node tests/mp.mjs`. Per rigenerare il bundle di Trystero: `node scripts/vendor-net.mjs`.
