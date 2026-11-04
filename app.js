(() => {
  const TZ = "America/Argentina/Buenos_Aires";
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/rugby";
  const WR = "https://api.wr-rims-prod.pulselive.com/rugby/v3/match";
  const MESES_A_CARGAR = 2; // mes actual + el siguiente

  const BANDERAS = {
    "Argentina": "🇦🇷", "Argentina XV": "🇦🇷", "Irlanda": "🇮🇪", "Italia": "🇮🇹", "Sudáfrica": "🇿🇦",
    "Escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "Nueva Zelanda": "🇳🇿", "Gales": "🏴󠁧󠁢󠁷󠁬󠁳󠁿", "Japón": "🇯🇵",
    "Francia": "🇫🇷", "Fiji": "🇫🇯", "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Inglaterra A": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "Australia": "🇦🇺",
    "Uruguay": "🇺🇾", "Chile": "🇨🇱", "Georgia": "🇬🇪", "Samoa": "🇼🇸", "Tonga": "🇹🇴",
    "Portugal": "🇵🇹", "España": "🇪🇸", "Rumania": "🇷🇴", "Estados Unidos": "🇺🇸",
    "Canadá": "🇨🇦", "Brasil": "🇧🇷", "Paraguay": "🇵🇾", "Hong Kong": "🇭🇰", "Zimbabue": "🇿🇼",
    "Namibia": "🇳🇦", "Bélgica": "🇧🇪", "Países Bajos": "🇳🇱", "Alemania": "🇩🇪", "Kenia": "🇰🇪",
    "Perú": "🇵🇪", "Colombia": "🇨🇴", "México": "🇲🇽", "Suiza": "🇨🇭", "Polonia": "🇵🇱", "Suecia": "🇸🇪",
  };

  const $dias = document.getElementById("days");
  const $lista = document.getElementById("lista");
  const $canal = document.getElementById("canal");
  const $detalle = document.getElementById("detalle");
  const $act = document.getElementById("actualizado");

  // ---------- Fechas (todo en hora argentina) ----------
  const claveDia = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const sumarDias = (clave, n) => {
    const d = new Date(clave + "T12:00:00-03:00");
    d.setUTCDate(d.getUTCDate() + n);
    return claveDia(d);
  };
  const horaArg = (d) => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const hoy = () => claveDia(new Date());

  function mesesEspn() {
    const [y, m] = hoy().split("-").map(Number);
    return Array.from({ length: MESES_A_CARGAR }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 + i, 1));
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
  }
  function finDeRango() {
    const [y, m] = hoy().split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + MESES_A_CARGAR, 0));
    return d.toISOString().slice(0, 10);
  }

  // ---------- Ligas activas (las marcadas en config.js) ----------
  const LIGAS = window.LIGAS;
  const activas = new Set(LIGAS.filter((l) => l.activa).map((l) => l.clave));
  try { localStorage.removeItem("ligasActivas"); } catch {}

  // ---------- Datos ----------
  const partidos = new Map(); // "fuente:id" -> partido

  // Partidos guardados (datos-fijos.js, generado con herramientas/generar_fijos.py).
  // Son datos reales copiados de las fuentes; los datos en vivo los reemplazan cuando llegan.
  const FIJOS = (window.DATOS_FIJOS && window.DATOS_FIJOS.partidos) || [];
  function cargarFijos() {
    FIJOS.forEach((f) => {
      const liga = LIGAS.find((l) => l.clave === f.liga);
      if (!liga) return;
      const inicio = new Date(f.inicio);
      const eq = (t) => ({ ...t, nombre: nombreEs(t.nombre) });
      partidos.set(f.id, { ...f, liga, inicio, dia: claveDia(inicio), local: eq(f.local), visita: eq(f.visita),
        tv: window.TV_CONFIRMADA[f.id] || null, fijo: true });
    });
  }
  // Entre los guardados, una sola fuente por liga (BBC, si no TheSportsDB, si no World Rugby)
  // (la liga "base" es la de ESPN; ESPN, si no BBC, si no TheSportsDB, si no World Rugby)
  const ligaBase = (l) => l.respaldoDe || l.clave;
  const fuenteFija = {};
  ["wr", "tsdb", "bbc", "espn"].forEach((fu) => FIJOS.forEach((f) => {
    const l = LIGAS.find((x) => x.clave === f.liga);
    if (l && l.fuente === fu) fuenteFija[ligaBase(l)] = fu;
  }));

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }

  function base(id, liga, inicio, local, visita, extra) {
    return {
      id, liga, inicio, dia: claveDia(inicio), local, visita,
      tv: window.TV_CONFIRMADA[id] || null,
      ...extra,
    };
  }

  // Solo rugby masculino de 15: afuera femenino y seven
  const esFemenino = (n) => /femenin|women|woman|ladies|\(W\)|\bW$/i.test(n);
  const esSeven = (n) => /seven|\b7s\b|svns/i.test(n);
  const excluido = (n) => esFemenino(n) || esSeven(n);

  // ESPN
  function normalizarEspn(e, liga) {
    const c = e.competitions[0];
    if (c.timeValid === false) return null; // horario sin confirmar
    const eq = (lado) => {
      const x = c.competitors.find((t) => t.homeAway === lado) || {};
      return { nombre: x.team?.displayName || "A definir", logo: x.team?.logo, score: x.score };
    };
    return base("espn:" + e.id, liga, new Date(e.date), eq("home"), eq("away"), {
      ronda: e.week?.text || c.notes?.[0]?.headline || "",
      estado: c.status.type.state, // pre | in | post
      estadoTxt: c.status.type.shortDetail || c.status.type.description,
      cancelado: /CANCELED|POSTPONED|ABANDONED/.test(c.status.type.name),
      sede: [c.venue?.fullName, c.venue?.address?.city].filter(Boolean).join(", "),
      fuente: "ESPN",
      espnId: e.id,
    });
  }

  // Si ESPN no responde, se usan los últimos datos reales que se bajaron de ESPN (hasta 7 días),
  // avisando de cuándo son. Nunca se inventa nada.
  const RESPALDO_MAX = 7 * 24 * 60 * 60 * 1000;
  let respaldoUsado = 0; // fecha del respaldo más viejo en uso (0 = ninguno)
  const espnOk = new Set(); // ligas de ESPN que respondieron en esta sesión
  // Liga de otra fuente que reemplaza a una de ESPN (si existe)
  const reemplazoWr = (liga) => LIGAS.find((l) => l.respaldoDe === liga.clave);
  // Para una liga de ESPN, qué fuente se muestra: ESPN si respondió, si no BBC, si no World Rugby
  function fuenteElegida(claveEspn) {
    if (espnOk.has(claveEspn)) return "espn";
    if (bbcOk && LIGAS_BBC.some((l) => l.respaldoDe === claveEspn)) return "bbc";
    if (LIGAS.some((l) => l.fuente === "tsdb" && l.respaldoDe === claveEspn && tsdbOk.has(l.clave))) return "tsdb";
    return "wr";
  }

  function guardarRespaldo(liga, lista) {
    try {
      localStorage.setItem("respaldo:" + liga.clave, JSON.stringify({
        t: Date.now(),
        ps: lista.map((p) => ({ ...p, liga: undefined, inicio: +p.inicio })),
      }));
    } catch {}
  }
  function usarRespaldo(liga) {
    if ([...partidos.values()].some((p) => p.liga === liga)) return; // ya hay datos de esta sesión
    if (reemplazoWr(liga)) return; // World Rugby la tiene en vivo: mejor que datos guardados
    let r;
    try { r = JSON.parse(localStorage.getItem("respaldo:" + liga.clave)); } catch {}
    if (!r || Date.now() - r.t > RESPALDO_MAX) return;
    r.ps.forEach((p) => partidos.set(p.id, { ...p, liga, inicio: new Date(p.inicio), tv: window.TV_CONFIRMADA[p.id] || null }));
    respaldoUsado = respaldoUsado ? Math.min(respaldoUsado, r.t) : r.t;
  }

  async function cargarEspn(liga) {
    let res;
    try {
      res = await Promise.all(mesesEspn().map((m) =>
        getJSON(`${ESPN}/${liga.id}/scoreboard?dates=${m}&limit=500&lang=es&region=ar`)
      ));
    } catch (err) {
      usarRespaldo(liga);
      throw err;
    }
    const lista = [];
    res.forEach((j) => (j.events || []).forEach((e) => {
      const p = normalizarEspn(e, liga);
      if (p && !excluido(p.local.nombre) && !excluido(p.visita.nombre) && !esSeven(e.name || "")) lista.push(p);
    }));
    lista.forEach((p) => partidos.set(p.id, p));
    espnOk.add(liga.clave);
    guardarRespaldo(liga, lista);
  }

  // World Rugby
  const LIGAS_WR = LIGAS.filter((l) => l.fuente === "wr");
  const nombreEs = (n) => {
    const pos = /^(Northern|Southern) (\d+)$/.exec(n); // cruces finales del Nations Championship
    if (pos) return `${pos[2]}º Hemisferio ${pos[1] === "Northern" ? "Norte" : "Sur"}`;
    // Cruces de Mundial aún sin equipos
    const t = n.trim();
    let m;
    if ((m = /^Pool (\w) Winner$/i.exec(t))) return `1º Grupo ${m[1]}`;
    if ((m = /^Pool (\w) Runner-Up$/i.exec(t))) return `2º Grupo ${m[1]}`;
    if ((m = /^Pool ([\w/]+?)\/? Best 3RD$/i.exec(t))) return `Mejor 3º (${m[1]})`;
    if ((m = /^Winner R16 \((\d+)\)$/i.exec(t))) return `Ganador octavos ${m[1]}`;
    if ((m = /^Winner QF(\d)$/i.exec(t))) return `Ganador cuartos ${m[1]}`;
    if ((m = /^Winner SF(\d)$/i.exec(t))) return `Ganador semi ${m[1]}`;
    if ((m = /^Runner-Up SF(\d)$/i.exec(t))) return `Perdedor semi ${m[1]}`;
    return window.NOMBRES_ES[t] || t;
  };
  // Equipos que todavía no se conocen (ej. "1º Hemisferio Norte", "Ganador cuartos 2")
  const aDefinir = (n) => /definir|tbd|tbc|hemisferio|grupo|ganador|perdedor|mejor 3/i.test(n);

  function normalizarWr(m) {
    if ((m.sport || "").toUpperCase() !== "MRU") return null; // solo rugby masculino de 15
    if (esSeven(m.competition || "") || (m.teams || []).some((t) => excluido(t.name || ""))) return null;
    const liga = LIGAS_WR.find((l) => (m.competition || "").startsWith(l.patron));
    if (!liga) return null;
    // Sin horario definido, World Rugby pone las 00:00 UTC del día. Si eso cae de madrugada
    // en la sede (ej. 01:00 en Francia), no es un horario real: se descarta el partido.
    const horaSede = new Date(m.time.millis + (m.time.gmtOffset || 0) * 3600 * 1000).getUTCHours();
    if (m.status === "U" && m.time.millis === Date.parse(m.time.label + "T00:00:00Z") && horaSede < 10) return null;
    const st = m.status || "U";
    const estado = st === "C" ? "post" : st.startsWith("L") ? "in" : "pre";
    const eq = (i) => ({ nombre: nombreEs(m.teams?.[i]?.name || "A definir"), score: m.scores?.[i] });
    const vivoTxt = st === "LHT" ? "Entretiempo" : m.clock?.label ? `${m.clock.label}'` : "EN VIVO";
    return base("wr:" + m.matchId, liga, new Date(m.time.millis), eq(0), eq(1), {
      ronda: m.eventPhase || "",
      estado,
      estadoTxt: estado === "post" ? "Final" : estado === "in" ? vivoTxt : "Programado",
      cancelado: /^(P|A|X|CC)$/.test(st),
      sede: [m.venue?.name, m.venue?.city].filter(Boolean).join(", "),
      fuente: "World Rugby",
      wrMatchId: m.matchId,
      wrEventoId: m.events?.[0]?.id,
    });
  }

  async function cargarWr(desde = hoy(), hasta = finDeRango()) {
    for (let page = 0, total = 1; page < total; page++) {
      const j = await getJSON(`${WR}?startDate=${desde}&endDate=${hasta}&sort=asc&pageSize=100&page=${page}`);
      total = j.pageInfo?.numPages || 1;
      (j.content || []).forEach((m) => {
        const p = normalizarWr(m);
        if (p) partidos.set(p.id, p);
      });
    }
    wrOk = true;
  }

  // BBC Sport: un solo pedido trae todos los partidos de rugby del período
  const BBC = "https://web-cdn.api.bbci.co.uk/wc-poll-data/container/sport-data-scores-fixtures";
  const LIGAS_BBC = LIGAS.filter((l) => l.fuente === "bbc");
  let bbcOk = false;
  let wrOk = false;

  function normalizarBbc(e) {
    const urn = (e.tournament?.urn || "").split(":").pop();
    const liga = LIGAS_BBC.find((l) => l.urn === urn);
    if (!liga) return null;
    if (/TBC/i.test(e.time?.displayTimeUK || "")) return null; // horario sin confirmar: no se muestra
    const st = e.status || "";
    const estado = st === "PostEvent" ? "post" : st === "MidEvent" ? "in" : "pre";
    const eq = (t) => ({ nombre: nombreEs(t?.fullName || "A definir"), score: t?.score });
    return base("bbc:" + e.id, liga, new Date(e.startDateTime), eq(e.home), eq(e.away), {
      ronda: "",
      estado,
      estadoTxt: estado === "in" ? e.periodLabel?.value || "EN VIVO" : estado === "post" ? "Final" : "Programado",
      cancelado: /Postponed|Cancelled|Abandoned/i.test(st),
      sede: e.venue?.name || "",
      fuente: "BBC Sport",
    });
  }

  async function cargarBbc(desde = hoy(), hasta = finDeRango()) {
    const q = new URLSearchParams({
      selectedStartDate: desde, selectedEndDate: hasta, todayDate: hoy(),
      urn: "urn:bbc:sportsdata:rugby-union", useSdApi: "false",
    });
    const j = await getJSON(`${BBC}?${q}`);
    (j.eventGroups || []).forEach((g) => (g.secondaryGroups || []).forEach((s) => (s.events || []).forEach((e) => {
      const p = normalizarBbc(e);
      if (p && !excluido(p.local.nombre) && !excluido(p.visita.nombre)) partidos.set(p.id, p);
    })));
    bbcOk = true;
  }

  // TheSportsDB: próximos partidos y últimos resultados de una liga (horarios en UTC)
  const TSDB = "https://www.thesportsdb.com/api/v1/json/123";
  const tsdbOk = new Set();

  function normalizarTsdb(e, liga) {
    if (!e.strTimestamp) return null;
    const st = e.strStatus || "NS";
    const cancelado = e.strPostponed === "yes" || /PST|CANC|ABD/i.test(st);
    const estado = /^(FT|AET|AOT|Match Finished)$/i.test(st) ? "post" : /^(NS|TBD|Not Started)$/i.test(st) || cancelado ? "pre" : "in";
    if (estado === "pre" && /T00:00:00/.test(e.strTimestamp)) return null; // sin horario confirmado
    const eq = (n, s, logo) => ({ nombre: n || "A definir", score: s ?? undefined, logo: logo || undefined });
    return base("tsdb:" + e.idEvent, liga, new Date(e.strTimestamp + "Z"),
      eq(e.strHomeTeam, e.intHomeScore, e.strHomeTeamBadge), eq(e.strAwayTeam, e.intAwayScore, e.strAwayTeamBadge), {
        ronda: "",
        estado,
        estadoTxt: estado === "post" ? "Final" : estado === "in" ? st : "Programado",
        cancelado,
        sede: e.strVenue || "",
        fuente: "TheSportsDB",
      });
  }

  async function cargarTsdb(liga) {
    const res = await Promise.all(["eventsnextleague", "eventspastleague"].map((f) => getJSON(`${TSDB}/${f}.php?id=${liga.id}`)));
    res.forEach((j) => (j.events || []).forEach((e) => {
      const p = normalizarTsdb(e, liga);
      if (p) partidos.set(p.id, p);
    }));
    tsdbOk.add(liga.clave);
  }

  cargarFijos();

  // tareas: lista de ligas (ESPN o TheSportsDB), "bbc" y/o "wr"
  async function cargar(tareas) {
    respaldoUsado = 0;
    const res = await Promise.allSettled(tareas.map((t) =>
      t === "wr" ? cargarWr() : t === "bbc" ? cargarBbc() : t.fuente === "tsdb" ? cargarTsdb(t) : cargarEspn(t)));
    return res.filter((r) => r.status === "rejected").length;
  }
  const todasLasTareas = () => [...LIGAS.filter((l) => l.fuente === "espn" || l.fuente === "tsdb"), "bbc", "wr"];

  // Un mismo partido puede venir de ESPN y de World Rugby: se queda el de ESPN.
  const sinAcentos = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const claveCruce = (p) => p.dia + "|" + [p.local.nombre, p.visita.nombre].map(sinAcentos).sort().join("|");
  // A veces una fuente carga el mismo partido dos veces (ej. "Pau" y "Section Paloise").
  // Un equipo no puede jugar dos veces el mismo día en la misma liga: queda la entrada más completa.
  const completitud = (p) => (p.local.logo ? 1 : 0) + (p.visita.logo ? 1 : 0) + (p.sede ? 1 : 0);
  function sinDuplicadosInternos(lista) {
    const ordenados = [...lista].sort((a, b) => completitud(b) - completitud(a) || a.id.localeCompare(b.id));
    const ocupados = new Set();
    return ordenados.filter((p) => {
      const claves = [p.local, p.visita]
        .filter((eq) => !aDefinir(eq.nombre)) // equipos aún sin definir no cuentan
        .map((eq) => p.liga.clave + "|" + p.dia + "|" + sinAcentos(eq.nombre));
      if (claves.some((k) => ocupados.has(k))) return false;
      claves.forEach((k) => ocupados.add(k));
      return true;
    });
  }

  // Un partido guardado se muestra salvo que su fuente haya respondido en vivo para esa fecha
  // (si respondió y no lo trae, es porque cambió o se borró)
  function fijoVigente(p) {
    const enRango = p.dia <= finDeRango();
    const f = p.liga.fuente;
    const vivo = f === "espn" ? espnOk.has(p.liga.clave) : f === "bbc" ? bbcOk : f === "wr" ? wrOk : f === "tsdb" ? tsdbOk.has(p.liga.clave) : false;
    if (vivo && (enRango || f === "tsdb")) return false;
    const b = ligaBase(p.liga);
    // Fuera del período en vivo: vale el guardado de la mejor fuente
    if (!enRango) return fuenteFija[b] === f;
    // Dentro del período: solo si ninguna fuente de esa liga respondió en vivo
    const elegida = fuenteElegida(b);
    const hayVivo = elegida === "espn" || elegida === "bbc" || elegida === "tsdb" ||
      (elegida === "wr" && wrOk && LIGAS.some((l) => l.fuente === "wr" && ligaBase(l) === b));
    return !hayVivo && fuenteFija[b] === f;
  }

  function visibles() {
    const deEspn = new Set();
    partidos.forEach((p) => { if (p.fuente === "ESPN") deEspn.add(claveCruce(p)); });
    return sinDuplicadosInternos([...partidos.values()].filter((p) =>
      activas.has(p.liga.clave) &&
      (!p.fijo || fijoVigente(p)) &&
      (p.fijo || !(p.liga.respaldoDe && fuenteElegida(p.liga.respaldoDe) !== p.liga.fuente)) && // se usa la mejor fuente disponible
      !(p.fuente !== "ESPN" && deEspn.has(claveCruce(p)))
    ));
  }

  // ---------- Filtros y días ----------
  const juegaArgentina = (p) => p.local.nombre.startsWith("Argentina") || p.visita.nombre.startsWith("Argentina");
  const TOP = new Set(window.TOP_SELECCIONES.map(sinAcentos));
  const esTop = (t) => aDefinir(t.nombre) || TOP.has(sinAcentos(nombreEs(t.nombre)));
  const pasaFiltros = (p) =>
    (p.liga.grupo !== "Selecciones" || esTop(p.local) || esTop(p.visita)) &&
    (!$canal.value || (p.tv && p.tv.canales.includes($canal.value)));

  function diasDisponibles(lista) {
    const h = hoy();
    return [...new Set(lista.filter((p) => p.dia >= h).map((p) => p.dia))].sort();
  }

  let diaActivo = new URLSearchParams(location.search).get("dia");
  function elegirDia(dias) {
    if (!dias.includes(diaActivo)) diaActivo = dias.find((d) => d >= (diaActivo || hoy())) || dias[0] || null;
  }

  // ---------- Render ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function etiquetaDia(clave) {
    const h = hoy();
    if (clave === h) return "Hoy";
    if (clave === sumarDias(h, 1)) return "Mañana";
    const t = new Date(clave + "T12:00:00-03:00").toLocaleDateString("es-AR", { weekday: "short", timeZone: TZ });
    return t.charAt(0).toUpperCase() + t.slice(1).replace(".", "");
  }

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function renderDias(dias, lista) {
    $dias.hidden = dias.length === 0;
    const cant = {};
    lista.forEach((p) => (cant[p.dia] = (cant[p.dia] || 0) + 1));
    $dias.innerHTML = dias.map((d) => {
      const [, m, dd] = d.split("-");
      return `
        <button class="day ${d === diaActivo ? "activo" : ""}" data-dia="${d}">
          <span class="d-sem">${etiquetaDia(d)}</span>
          <span class="d-num">${Number(dd)}</span>
          <span class="d-mes">${MESES[m - 1]}</span>
        </button>`;
    }).join("");
    $dias.querySelector(".activo")?.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function pillsTv(p) {
    if (!p.tv) return "";
    return p.tv.canales.map((c) =>
      `<span class="pill" style="background:${window.COLORES_CANAL[c] || "#374151"}">📺 ${esc(c)}</span>`
    ).join("");
  }

  // Escudo o bandera; si no hay, un círculo con la inicial
  function iconoEquipo(t) {
    if (BANDERAS[t.nombre]) return `<span class="ic bandera">${BANDERAS[t.nombre]}</span>`;
    if (t.logo) return `<img class="ic logo" src="${esc(t.logo)}" alt="" loading="lazy">`;
    return `<span class="ic inicial">${esc((t.nombre || "?").charAt(0))}</span>`;
  }
  const equipoHtml = (t) => `<div class="equipo">${iconoEquipo(t)}<span>${esc(t.nombre)}</span></div>`;

  function filaPartido(p) {
    let hora = horaArg(p.inicio), clsHora = "";
    if (p.cancelado) { hora = "Susp."; }
    else if (p.estado === "in") { hora = p.estadoTxt || "EN VIVO"; clsHora = "vivo"; }
    else if (p.estado === "post") { hora = "Final"; }
    else if (Date.now() - p.inicio > 3 * 60 * 60 * 1000) { hora = "Sin datos"; }

    const conScore = !(p.estado === "pre" || p.cancelado);
    const a = Number(p.local.score), b = Number(p.visita.score);
    const gana = (i) => p.estado === "post" && (i === 0 ? a > b : b > a) ? "gana" : "";
    const pierde = (i) => p.estado === "post" && (i === 0 ? a < b : b < a) ? "pierde" : "";
    const lineaEq = (t, i) => `
      <div class="f-eq ${gana(i)} ${pierde(i)}">
        ${iconoEquipo(t)}<span class="f-nom">${esc(t.nombre)}</span>
        ${conScore ? `<span class="f-score">${esc(t.score)}</span>` : ""}
      </div>`;

    const tv = pillsTv(p);
    return `
      <div class="fila ${juegaArgentina(p) ? "pumas" : ""} ${p.estado === "in" ? "en-vivo" : ""}" data-id="${esc(p.id)}">
        <div class="f-estado ${clsHora}">${clsHora ? '<span class="punto"></span>' : ""}${esc(hora)}</div>
        <div class="f-equipos">
          ${lineaEq(p.local, 0)}
          ${lineaEq(p.visita, 1)}
          ${tv ? `<div class="tvs">${tv}</div>` : ""}
        </div>
        <span class="f-flecha">›</span>
      </div>`;
  }

  function renderLista(lista) {
    if (!diaActivo) {
      $lista.innerHTML = `<div class="vacio-msg">${$canal.value
        ? "No hay próximos partidos con estos filtros."
        : "No hay partidos programados en las próximas semanas."}</div>`;
      return;
    }
    const delDia = lista.filter((p) => p.dia === diaActivo).sort((a, b) => a.inicio - b.inicio);
    const orden = LIGAS.map((l) => l.clave);
    const grupos = new Map();
    delDia.forEach((p) => {
      const k = p.liga.nombre; // ligas con el mismo nombre (ej. Test Matches de ESPN y World Rugby) van juntas
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    });
    $lista.innerHTML = [...grupos.values()]
      .sort((a, b) => orden.indexOf(a[0].liga.clave) - orden.indexOf(b[0].liga.clave))
      .map((ps) => {
        ps.sort((a, b) => a.inicio - b.inicio);
        return `
        <section class="comp">
          <h2 class="c-link" data-liga="${esc(ps[0].liga.clave)}" title="Ver tabla y partidos">
            <span class="c-nombre">${esc(ps[0].liga.nombre)}</span>
            <span class="c-ronda">${ps[0].ronda ? esc(ps[0].ronda) : ""}<span class="c-flecha">›</span></span>
          </h2>
          ${ps.map(filaPartido).join("")}
        </section>`;
      }).join("");
  }

  function render() {
    const lista = visibles().filter(pasaFiltros);
    const dias = diasDisponibles(lista);
    elegirDia(dias);
    if (diaActivo && !ligaAbierta) history.replaceState(null, "", "?dia=" + diaActivo);
    renderDias(dias, lista);
    renderLista(lista);
  }

  function renderCanales() {
    const canales = new Set(Object.values(window.TV_CONFIRMADA).flatMap((t) => t.canales));
    document.getElementById("filtros").hidden = canales.size === 0;
    $canal.innerHTML = `<option value="">Todos los canales</option>` +
      [...canales].sort().map((c) => `<option>${esc(c)}</option>`).join("");
  }

  function abrirDetalle(p) {
    window.TR.abrirDetalle(p); // detalle.js
  }

  // ---------- Carga y refresco ----------
  async function actualizar(tareas = todasLasTareas()) {
    const errores = await cargar(tareas);
    if (!partidos.size && errores) {
      $lista.innerHTML = `<div class="vacio-msg">No se pudo conectar. Revisá tu conexión.<br><button data-reintentar>Reintentar</button></div>`;
      return;
    }
    render();
    if (ligaAbierta) renderPartidosLiga();
    else if (ligaPendiente) { abrirLiga(ligaPendiente, false); ligaPendiente = null; }
    const fechaResp = respaldoUsado && new Date(respaldoUsado).toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    $act.textContent = "Actualizado " + horaArg(new Date()) +
      (respaldoUsado ? ` · ESPN no responde: se muestran sus datos del ${fechaResp}` : errores ? ` · ${errores} fuentes no respondieron` : "");
  }

  $dias.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dia]");
    if (b) { diaActivo = b.dataset.dia; render(); }
  });
  $lista.addEventListener("click", (e) => {
    if (e.target.closest("[data-reintentar]")) return actualizar();
    const cab = e.target.closest("[data-liga]");
    if (cab) return abrirLiga(cab.dataset.liga);
    const fila = e.target.closest(".fila");
    if (fila) abrirDetalle(partidos.get(fila.dataset.id));
  });
  $canal.addEventListener("change", render);

  // Cada 30 s: si hay partidos en vivo o por empezar, recarga solo esas fuentes
  setInterval(() => {
    const ahora = Date.now();
    const tareas = new Set();
    partidos.forEach((p) => {
      const enJuego = p.estado === "in" || (p.estado === "pre" && p.inicio - ahora < 60 * 1000 && ahora - p.inicio < 3 * 60 * 60 * 1000);
      if (enJuego && activas.has(p.liga.clave)) tareas.add(p.liga.fuente === "espn" || p.liga.fuente === "tsdb" ? p.liga : p.liga.fuente);
    });
    if (tareas.size) actualizar([...tareas]);
  }, 30 * 1000);
  // Cada 10 min: recarga todo (fixtures nuevos, cambios de horario, cambio de día)
  setInterval(() => actualizar(), 10 * 60 * 1000);

  // ---------- Página de una liga: tabla + partidos ----------
  const $vistaPartidos = document.getElementById("vistaPartidos");
  const $vistaLiga = document.getElementById("vistaLiga");
  const $ligaNombre = document.getElementById("ligaNombre");
  const $ligaTabla = document.getElementById("ligaTabla");
  const $ligaPartidos = document.getElementById("ligaPartidos");
  let ligaAbierta = null;
  let ligaPendiente = new URLSearchParams(location.search).get("liga");

  const ligaPorClave = (clave) => LIGAS.find((l) => l.clave === clave);
  const sinTabla = (liga) => /test matches/i.test(liga.nombre);

  function fechaLarga(dia) {
    const t = new Date(dia + "T12:00:00-03:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
    const e = etiquetaDia(dia);
    return (e === "Hoy" || e === "Mañana" ? e + " · " : "") + t.charAt(0).toUpperCase() + t.slice(1);
  }

  function bloquePorDia(titulo, ps) {
    if (!ps.length) return "";
    const dias = [...new Set(ps.map((p) => p.dia))];
    return `<h3 class="liga-sec">${titulo}</h3>` + dias.map((d) => `
      <section class="comp">
        <h2><span>${esc(fechaLarga(d))}</span><span class="c-ronda">${esc(ps.find((p) => p.dia === d).ronda || "")}</span></h2>
        ${ps.filter((p) => p.dia === d).map(filaPartido).join("")}
      </section>`).join("");
  }

  function renderPartidosLiga() {
    const liga = ligaPorClave(ligaAbierta);
    const ps = visibles().filter((p) => p.liga.nombre === liga.nombre && pasaFiltros(p)).sort((a, b) => a.inicio - b.inicio);
    const h = hoy();
    const proximos = ps.filter((p) => p.dia >= h);
    const jugados = ps.filter((p) => p.dia < h && p.estado === "post").reverse();
    $ligaPartidos.innerHTML = bloquePorDia("Próximos partidos", proximos) + bloquePorDia("Resultados recientes", jugados) ||
      `<div class="vacio-msg">No hay partidos de este torneo en las próximas semanas.</div>`;
  }

  async function abrirLiga(clave, guardarEnHistorial = true) {
    const liga = ligaPorClave(clave);
    if (!liga) return;
    ligaAbierta = clave;
    if (guardarEnHistorial) history.pushState({ liga: clave }, "", `?dia=${diaActivo || ""}&liga=${clave}`);
    $vistaPartidos.hidden = true;
    $vistaLiga.hidden = false;
    $ligaNombre.textContent = liga.nombre;
    window.scrollTo(0, 0);
    renderPartidosLiga();
    if (sinTabla(liga)) { $ligaTabla.innerHTML = ""; return; }
    $ligaTabla.innerHTML = `<div class="vacio-msg">Cargando tabla…</div>`;
    const html = await window.TR.tablaLiga(liga); // tablas.js
    if (ligaAbierta === clave) $ligaTabla.innerHTML = html;
  }

  function cerrarLiga() {
    ligaAbierta = null;
    $vistaLiga.hidden = true;
    $vistaPartidos.hidden = false;
    render();
  }

  document.getElementById("volver").addEventListener("click", () => {
    if (history.state?.liga) history.back();
    else { cerrarLiga(); history.replaceState(null, "", "?dia=" + (diaActivo || "")); }
  });
  window.addEventListener("popstate", () => {
    const clave = new URLSearchParams(location.search).get("liga");
    if (clave) abrirLiga(clave, false); else cerrarLiga();
  });
  $ligaPartidos.addEventListener("click", (e) => {
    const fila = e.target.closest(".fila");
    if (fila) abrirDetalle(partidos.get(fila.dataset.id));
  });

  // Lo que comparten detalle.js y tablas.js
  window.TR = {
    TZ, ESPN, WR, esc, horaArg, getJSON, partidos, BANDERAS, pillsTv, equipoHtml, iconoEquipo,
    nombreEs, ligasActivas: () => LIGAS.filter((l) => activas.has(l.clave)),
    // El mismo partido cargado desde World Rugby (para mostrar detalle de partidos de BBC)
    ligas: LIGAS,
    gemeloWr: (p) => [...partidos.values()].find((x) => x.wrMatchId && claveCruce(x) === claveCruce(p)),
    $detalle,
  };

  renderCanales();
  $lista.innerHTML = `<div class="vacio-msg">Cargando partidos…</div>`;
  actualizar();
})();
