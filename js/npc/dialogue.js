// Dialoghi procedurali tra abitanti: italiano con espressioni venete. Le persone sono inventate.
export const NAMES_M = ['Giovanni', 'Luigi', 'Bepi', 'Toni', 'Franco', 'Gino', 'Marco', 'Luca', 'Paolo', 'Mario', 'Renzo', 'Sergio', 'Alberto', 'Nicola', 'Stefano', 'Matteo', 'Andrea', 'Davide', 'Gianni', 'Bruno', 'Piero', 'Carlo', 'Angelo', 'Tiziano', 'Ennio', 'Silvano', 'Dino', 'Lino', 'Ottavio', 'Remo'];
export const NAMES_F = ['Maria', 'Giulia', 'Anna', 'Lucia', 'Rosa', 'Franca', 'Gina', 'Elena', 'Sara', 'Chiara', 'Paola', 'Giovanna', 'Teresa', 'Silvia', 'Laura', 'Marta', 'Bruna', 'Nives', 'Elisa', 'Federica', 'Ida', 'Loredana', 'Rina', 'Graziella'];
export const NAMES_KID = [['Leo', 'm'], ['Tommaso', 'm'], ['Giorgia', 'f'], ['Sofia', 'f'], ['Alessandro', 'm'], ['Martina', 'f'], ['Mattia', 'm'], ['Aurora', 'f'], ['Pietro', 'm'], ['Emma', 'f'], ['Riccardo', 'm'], ['Alice', 'f']];
export const SURNAMES = ['Zanon', 'Bortolami', 'Trevisan', 'Schiavon', 'Marangon', 'Rizzato', 'Carraro', 'Zanella', 'Pegoraro', 'Boscaro', 'Favaro', 'Baldan', 'Callegaro', 'Rampazzo', 'Masiero', 'Bettio', 'Cecchinato', 'Tonello', 'Bertin', 'Cavinato', 'Sartori', 'Zampieri', 'Bonato', 'Cognolato', 'Furlan', 'Zago', 'Garbo', 'Frison', 'Toffanin', 'Scarso', 'Benato', 'Ruzza', 'Barison', 'Gottardo', 'Pittarello', 'Salmaso', 'Varotto', 'Zorzi'];

export const TOPIC_LABEL = {
  meteo: 'il tempo', sagra: 'la sagra', vino: 'il vino e la vendemmia', calcio: 'il calcio', pettegolezzi: 'i pettegolezzi del paese',
  lavoro: 'il lavoro', strade: 'le strade e il traffico', piccioni: 'i piccioni', famiglia: 'la famiglia', colli: 'i Colli Euganei',
  illuminati: 'gli strani fatti in paese', soldi: 'i prezzi e i soldi', scuola: 'la scuola', giochi: 'i giochi',
};

const T = {
  meteo: {
    open: ['Che caldo che fa oggi, eh?', 'Ti ga visto che nuvoloni sopra el Monte della Madonna?', 'Stamatina ghe gera na nebbia che no se vedeva gnente.', 'Dicono che domani el piove tutto el giorno.', 'Che bela giornata, ciò!'],
    reply: ['Eh sì, speremo che no tempesti sulle vigne.', 'Mi go el ginocchio che me fa male: segno che cambia el tempo.', 'L\'orto el ga bisogno d\'acqua, almeno quello.', 'Ostrega, e mi che go steso i panni!', 'Bon, così almeno se sta fresco.'],
    follow: ['Ai miei tempi i inverni gera ben più freddi.', 'Mia mojer la dise che vien su un temporale stasera.', 'Ti senti che arieta che vien giù dai colli?'],
    reply2: ['Eh, xe tuto cambià, anca el tempo.', 'Speremo ben, va.', 'Varda, mi no ghe credo più ai meteo dea television.'],
  },
  sagra: {
    open: ['Ti vien alla sagra a {village} sabato?', 'Gheto sentìo? Quest\'anno ala sagra i fa i bigoli col ragù d\'anatra!', 'Chi xe che organizza la pesca de beneficenza quest\'anno?', 'Ala sagra ghe sarà anca l\'orchestra de liscio!'],
    reply: ['Sicuro! No me perdo mai la porchetta.', 'Mi go dà na man a montar el tendon in piazza.', 'L\'anno scorso la tombola la ga vinta {other}, che fortuna sfacciata.', 'Speremo che no piova come l\'altra volta.'],
    follow: ['Dicono che ghe sarà anca i fuochi d\'artificio sopra la chiesa.', 'Ti me tieni un posto a tavola? Vegno con {other}.', 'Ma ti sa che el stand del vin lo gestisse {other}?'],
    reply2: ['Ah, alora el vin el sarà bon de sicuro!', 'Va ben, se vedemo là verso le otto.', 'Mi porto anca i nevodi, i se diverte un mondo.'],
  },
  vino: {
    open: ['La vendemmia quest\'anno xe stada bona sui colli.', 'Go assaggià el Fior d\'Arancio de {other}: na roba fina!', 'El Serprino novo xe pronto?', 'Le vigne sora {village} le ga patìo la siccità.'],
    reply: ['Eh, el Moscato xe vegnù dolce come el miele.', 'Mi preferisso el rosso dei Colli Euganei, quel robusto.', 'Bisogna stare attenti ala peronospora però.', 'Un goto de quel e se sta ben tuta la sera.'],
    follow: ['Ti vien a darme na man a imbottigliar sabato?', 'In cantina go ancora do damigiane del 2019.'],
    reply2: ['Volentieri, basta che ghe sia anca la sopressa!', 'Ostrega, alora vegno a trovarte presto.'],
  },
  calcio: {
    open: ['Ti ga visto el Padova domenica?', 'El Venezia ga perso ancora, che disastro.', 'Stasera ghe xe la partita, vien al bar a vardarla?', 'Me fio el gioca nei pulcini de {village}, el xe bravo sai!'],
    reply: ['Lassa star, no me ne parla!', 'L\'arbitro el gera venduto, te lo digo mi.', 'Sì sì, mi porto le patatine.', 'Eh, i xe giovani, i ga da imparar.'],
    follow: ['Se i continua cussì i va in serie D!', 'Al bar el {other} el ga scommesso dieci euro sul pareggio.'],
    reply2: ['Bon, almeno se fa do ciacole.', 'Mi tifo sempre, anca quando i perde.'],
  },
  pettegolezzi: {
    open: ['Lo sai che {other} xe stà visto in giro con na mora de {village2}?', 'La {otherF} la ga comprà na machina nova… chissà dove la ga trovà i schei!', 'Ti ga sentìo che {other} el vol vendere la casa in {street}?', '{other} el dise che el ga vinto al lotto, ma mi no ghe credo.'],
    reply: ['Ma va là! Chi te lo ga dito?', 'Eh, le malelingue no le se ferma mai.', 'Mi no digo gnente, ma… ga senso.', 'Ostrega, questa no la savevo!'],
    follow: ['Me lo ga dito la parrucchiera, e ela sa sempre tuto.', 'Zitto zitto, ma mi lo go visto coi me oci.'],
    reply2: ['Bon, alora xe vero de sicuro.', 'Mi resto muta come un pesse.', 'Vedaremo, vedaremo…'],
  },
  lavoro: {
    open: ['In bottega oggi xe stà un via vai che no te dico.', 'Domani go da andar in Comune a Bastia per le carte.', 'Me toca lavorar anca sabato, che barba.', 'I ga assunto un toso novo in fabbrica.'],
    reply: ['Almeno el lavoro no manca, xe già qualcosa.', 'Eh, la burocrazia xe peggio dei cinghiali.', 'Coraggio, che domenica se riposa.', 'Speremo ch\'el sia uno che ga voja de far.'],
    follow: ['Co vado in pension, mi me dedico solo all\'orto.', 'El capo el xe sempre de corsa, poareto.'],
    reply2: ['Beato ti, mi go ancora vent\'anni.', 'Eh, ognuno ga le so croci.'],
  },
  strade: {
    open: ['Ti ga visto la buca in {street}? Na volta o l\'altra qualcuno se fa male.', 'In {street} i core come mati con le machine.', 'Finalmente i ga asfaltà un toco de {street}!', 'La strada per i Colli la xe sempre piena de ciclisti la domenica.'],
    reply: ['Bisognaria meter un dosso, digo mi.', 'Go scritto anca al sindaco, ma gnente.', 'Era ora, ciò!', 'I ciclisti i xe peggio dele machine!'],
    follow: ['L\'altro giorno go visto un trattore incastrà in curva.', 'De sera no ghe xe gnanca un lampion acceso.'],
    reply2: ['Roba da mati.', 'Eh, a {village} xe uguale.'],
  },
  piccioni: {
    open: ['Sti piccioni ultimamente i xe dapartuto, no ti trovi?', 'Mi giuro che un piccion me vardava strano dal coperto de la chiesa.', 'Me nipote el dise che i piccioni xe droni del governo… roba da mati!', 'Un piccione me ga sporcà la machina appena lavada!'],
    reply: ['Ah sì, anca a mi! Che bestie maledete.', 'Ma va là, i piccioni xe piccioni.', 'Mi go messo i spuntoni sul davanzale.', 'Ghe xe uno col capelo… ma no, sarò mi che vedo storto.'],
    follow: ['Ieri uno el gera fermo sul lampion e el me fissava, giuro.', 'Dicono che i porta via le pile dai telecomandi!'],
    reply2: ['Ostrega, adesso me fa paura anca a mi.', 'Ma dai, ti ga bevù massa Serprino!', 'Varda, mi chiudo le finestre.'],
  },
  famiglia: {
    open: ['Me nevodo el se sposa a {month}!', 'Mio fio el lavora a Padova adesso, el vien su solo la domenica.', 'I tosi i va a scuola a {village}, li porto mi in machina.', 'Mia mojer la fa i bigoli fatti in casa domenica, vien anca ti!'],
    reply: ['Auguri! Xe sempre na bela festa.', 'Eh, i zoveni i va via tuti, purtroppo.', 'Che bravi, salutameli tanto.', 'Ostrega, i bigoli de to mojer xe i più boni del comune!'],
    follow: ['Ghe xe da preparar tuto, el pranzo, i fiori…', 'La nona la xe ancora in gamba, ottantanove anni!'],
    reply2: ['Se ti ga bisogno, chiameme.', 'Che brava! Na roccia, la nona.'],
  },
  colli: {
    open: ['Domenica vado a funghi sul Monte Grande.', 'Sul Monte della Madonna ghe xe un panorama che te lassa senza fià.', 'I cinghiali i ga rovinà tuto el prà sora casa.', 'Ti xe mai andà a piedi fino al Passo Fiorine?'],
    reply: ['Portame qualche porcino, eh!', 'Dal santuario se vede fin le Dolomiti, coi giorni ciari.', 'Bisognaria far qualcosa, i xe tropi.', 'Sì, ma con le me gambe adesso no ghe la fasso più.'],
    follow: ['In autunno vado a castagne verso Rovolon alto.', 'L\'aria dei colli fa ben, digo sempre.'],
    reply2: ['Ciama anca mi la prossima volta.', 'Altro che el smog de Padova!'],
  },
  soldi: {
    open: ['Ti ga visto quanto costa el pan adesso?', 'La bolletta dea luce la xe arivada doppia!', 'Al Despar i ga messo le offerte sul formajo.'],
    reply: ['Na volta con mille lire se faseva la spesa.', 'Bisogna stringer la cinghia, ciò.', 'Vado subito prima che finissa!'],
    follow: ['Mi spegno tuto e vado a dormir col sol.', 'Se andemo avanti cussì, tornemo al baratto.'],
    reply2: ['Eh, ti ga rason.', 'Mi go ancora le galline, almeno i ovi no i manca.'],
  },
  scuola: {
    open: ['Domani ghe xe la verifica de matematica!', 'La maestra la ga dà tantissimi compiti.', 'In gita andemo a Padova a veder la Cappella degli Scrovegni!'],
    reply: ['Mi no go studià gnente…', 'Uffa, mi volevo giocar.', 'Che bello! Mi porto la merenda grande.'],
    follow: ['Dopo vien a casa mia che giochemo?', 'Ti me passi le risposte?'],
    reply2: ['Sì, ma prima la mamma vol che fasso i compiti.', 'No, se no la maestra la se inrabia!'],
  },
  giochi: {
    open: ['Giochemo a nascondino vicino alla chiesa?', 'Ti ga visto quel piccione col capelo?', 'Femo na gara in bici fino al bar!'],
    reply: ['Sì! Conto mi!', 'Col capelo? Ma dai, i piccioni no porta el capelo!', 'Ti perdi sicuro!'],
    follow: ['Giuro! El gaveva anca n\'antenna!', 'Uno, do, tre…'],
    reply2: ['Ahahah, bugiardo!', 'Ti xe mato!'],
  },
  illuminati: {
    open: ['Ti ga sentìo che de notte ghe xe luci strane sul Monte della Madonna?', 'Mi go visto gente incappucciata vicino alla chiesa, l\'altra sera.', 'Dicono che soto na villa de {village} ghe sia un tunnel segreto.', 'El geometra Rampazzo el gira sempre con na valigetta… cossa ghe sarà dentro?'],
    reply: ['Zitto! Ghe xe orecchie dapartuto.', 'Ma va là, i sarà stà i fari de qualche machina.', 'Mi go sentìo parlar de na riunione, de note, in piazza.', 'Mia nona la diseva che i colli i xe pieni de segreti.'],
    follow: ['E quel\'auto nera parcheggiada davanti al Municipio? Nissun sa de chi la xe.', 'Ogni tanto el postin el consegna buste senza mittente…'],
    reply2: ['Brrr, me vien la pelle d\'oca.', 'Mi no so gnente e no voglio saver gnente.', 'Bisognaria fotografar tuto, per prova.'],
  },
};

const GREET_A = ['Ciao {B}!', 'Bondì, {B}!', 'Ehi {B}, come xela?', '{saluto} {B}!', 'Ciò {B}, xe tanto che no te vedo!', '{saluto}, sior {Bs}!'];
const GREET_A_F = ['Ciao {B}!', '{saluto} {B}!', 'Ciò {B}, xe tanto che no te vedo!', '{saluto}, siora {Bs}!'];
const GREET_B = ['Ciao {A}! Tuto ben, e ti?', 'Eh, se tira avanti, se tira.', 'Bondì! Che piaser vederte.', 'Ostrega, {A}! Proprio ti cercavo.', 'Bene bene, grazie a Dio.', 'Ciao! Te vedo in forma!'];
const KID_GREET = ['Ciao {B}!', 'Ehi {B}!', '{B}! Vien qua!'];
const KID_REPLY = ['Ciao {A}!', 'Eccome!', 'Ciao! Cossa femo?'];
const CLOSE_A = ['Bon, vado che me mojer me speta.', 'Dai, se vedemo!', 'Ciao, stame ben!', 'Salutame tua mama!', 'Bon, mi vado al bar, ciao!', 'Ciao, e ocio ai piccioni!', 'Bon, xe ora de andar a casa.'];
const CLOSE_B = ['Ciao ciao!', 'Ciao, bona giornata!', 'Se vedemo in piazza!', 'Ciao, e salutame tuti!', 'Bona serata!'];
const MONTHS = ['maggio', 'giugno', 'settembre', 'ottobre', 'aprile'];

const ADULT_TOPICS = ['meteo', 'sagra', 'vino', 'calcio', 'pettegolezzi', 'lavoro', 'strade', 'piccioni', 'famiglia', 'colli', 'soldi', 'illuminati'];
const ELDER_TOPICS = ['meteo', 'sagra', 'vino', 'pettegolezzi', 'piccioni', 'famiglia', 'colli', 'soldi', 'illuminati', 'strade'];
const KID_TOPICS = ['scuola', 'giochi', 'calcio', 'piccioni'];

function pick(r, a) { return a[Math.floor(r() * a.length)]; }

export function chooseTopic(a, b, r, forced) {
  if (forced && (forced !== 'scuola' || a.role === 'child')) return forced;
  if (a.role === 'child' && b.role === 'child') return pick(r, KID_TOPICS);
  if (a.role === 'elder' || b.role === 'elder') return pick(r, ELDER_TOPICS);
  return pick(r, ADULT_TOPICS);
}

// ctx: { hour, village, village2, street, other, otherF, rnd }
export function generateConversation(a, b, ctx, forcedTopic) {
  const r = ctx.rnd;
  const topic = chooseTopic(a, b, r, forcedTopic);
  const saluto = ctx.hour < 12 ? 'Buongiorno' : ctx.hour < 17 ? 'Buon pomeriggio' : 'Buonasera';
  const fill = (s) => s
    .replace(/\{A\}/g, a.first).replace(/\{B\}/g, b.first).replace(/\{Bs\}/g, b.last)
    .replace(/\{saluto\}/g, saluto).replace(/\{village\}/g, ctx.village).replace(/\{village2\}/g, ctx.village2)
    .replace(/\{street\}/g, ctx.street).replace(/\{other\}/g, ctx.other).replace(/\{otherF\}/g, ctx.otherF)
    .replace(/\{month\}/g, pick(r, MONTHS));
  const lines = [];
  const kids = a.role === 'child' && b.role === 'child';
  if (kids) {
    lines.push([a, fill(pick(r, KID_GREET))], [b, fill(pick(r, KID_REPLY))]);
  } else {
    lines.push([a, fill(pick(r, a.gender === 'f' ? GREET_A_F : GREET_A))], [b, fill(pick(r, GREET_B))]);
  }
  const addTopic = (tp) => {
    const t = T[tp];
    lines.push([a, fill(pick(r, t.open))], [b, fill(pick(r, t.reply))]);
    if (r() < 0.75) lines.push([a, fill(pick(r, t.follow))], [b, fill(pick(r, t.reply2))]);
  };
  addTopic(topic);
  let topic2 = null;
  if (!forcedTopic && r() < 0.35) {
    topic2 = chooseTopic(b, a, r);
    if (topic2 !== topic) {
      const t = T[topic2];
      lines.push([b, fill(pick(r, ['E po\', cambiando discorso… ', 'Ah, a proposito! ', 'Senti qua: '])) + fill(pick(r, t.open))], [a, fill(pick(r, t.reply))]);
    } else topic2 = null;
  }
  if (!kids) lines.push([a, fill(pick(r, CLOSE_A))], [b, fill(pick(r, CLOSE_B))]);
  else lines.push([a, 'Ciao!'], [b, 'Ciao ciao!']);
  return { topic, topic2, lines: lines.map(([who, text]) => ({ who, text })) };
}

// Reazioni brevi
export const SHOUTS = {
  pooped: ['Ostrega! Un piccione me ga centrà!', 'Maledeto piccione! La camicia nova!', 'Porta fortuna, i dise… ma che schifo!', 'Ma no! Proprio adesso che andavo dal dotor!', 'Sciò! Brutta bestiaccia!'],
  carPooped: ['La me machina! Appena lavada!', 'Ma varda ti che disastro sul cofano!'],
  thief: ['Al ladro! Quel piccione ga rubà la pila!', 'Ehi! Ferma, piccione ladro!', 'Ma ti ga visto? El piccione se ga portà via la batteria!'],
  near: ['Sciò! Sciò!', 'Ma che piccione curioso…', 'Cossa ti vol? No go briciole!', 'Ma… quel piccione ga un capelo?!'],
  laugh: ['Ahahah! Te ga centrà in pieno!', 'Ahah, porta fortuna, dai!'],
  car: ['Ocio, piccione!', 'Ma levate dala strada!'],
};
