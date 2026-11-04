// Detalle de partido: tantos, tarjetas, formaciones, estadísticas e historial.
// ESPN: endpoint "summary". World Rugby: "summary", "timeline" y "stats".
(() => {
  const TR = window.TR;
  const { esc, horaArg, getJSON, TZ } = TR;
  const $d = TR.$detalle;

  const ICONO = { try: "🏉", conv: "🥅", pen: "🎯", drop: "🦶", amarilla: "🟨", roja: "🟥" };
  const NOMBRE = { try: "Try", conv: "Conversión", pen: "Penal", drop: "Drop", amarilla: "Amarilla", roja: "Roja" };
  const PUNTOS = { try: 5, conv: 2, pen: 3, drop: 3, amarilla: 0, roja: 0 };

  const fechaCorta = (s) => new Date(s).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: TZ });

  // ---------- ESPN ----------
  function tipoEspn(t) {
    t = (t || "").toLowerCase();
    if (t.includes("penalty try")) return "try";
    if (t === "try") return "try";
    if (t.includes("conversion")) return "conv";
    if (t.includes("penalty goal")) return "pen";
    if (t.includes("drop")) return "drop";
    if (t.includes("amarilla") || t.includes("yellow")) return "amarilla";
    if (t.includes("roja") || t.includes("red card")) return "roja";
    return null;
  }

  async function datosEspn(p) {
    const s = await getJSON(`${TR.ESPN}/${p.liga.id}/summary?event=${p.espnId}&lang=es&region=ar`);
    const comp = s.header?.competitions?.[0] || {};
    const lado = {};
    (comp.competitors || []).forEach((c) => (lado[c.team.id] = c.homeAway === "home" ? 0 : 1));

    const eventos = (comp.details || []).map((d) => {
      const tipo = tipoEspn(d.type?.text);
      if (!tipo || lado[d.team?.id] === undefined) return null;
      return {
        tipo, lado: lado[d.team.id], periodo: d.period?.number || 1,
        min: d.clock?.displayValue || "", seg: d.clock?.value || 0,
        jugador: d.participants?.[0]?.athlete?.displayName || "",
      };
    }).filter(Boolean);

    const formaciones = [[], []];
    (s.rosters || []).forEach((r) => {
      const i = r.homeAway === "home" ? 0 : 1;
      formaciones[i] = (r.roster || []).map((j) => ({
        num: Number(j.jersey), nombre: j.athlete?.displayName || "", pos: j.position?.abbreviation || "",
      })).filter((j) => j.num).sort((a, b) => a.num - b.num);
    });

    const ultimos = [[], []];
    (s.lastFiveGames || []).forEach((g) => {
      const i = lado[g.team?.id];
      if (i === undefined) return;
      ultimos[i] = (g.events || []).map((e) => {
        const local = e.atVs === "vs";
        const propio = local ? e.homeTeamScore : e.awayTeamScore;
        const rival = local ? e.awayTeamScore : e.homeTeamScore;
        return { fecha: e.gameDate, rival: e.opponent?.displayName || "", local, res: e.gameResult, marcador: `${propio}-${rival}`, liga: e.leagueAbbreviation };
      });
    });

    const nombres = { [Object.keys(lado).find((k) => lado[k] === 0)]: p.local.nombre, [Object.keys(lado).find((k) => lado[k] === 1)]: p.visita.nombre };
    const h2h = (s.headToHeadGames?.[0]?.events || []).map((e) => ({
      fecha: e.gameDate,
      local: nombres[e.homeTeamId] || e.opponent?.displayName || "",
      visita: nombres[e.awayTeamId] || e.opponent?.displayName || "",
      marcador: `${e.homeTeamScore}-${e.awayTeamScore}`,
    }));

    return { eventos, formaciones, stats: [], ultimos, h2h };
  }

  // ---------- World Rugby ----------
  const TIPO_WR = { Try: "try", Con: "conv", Pen: "pen", Drop: "drop", YC: "amarilla", RC: "roja" };
  const STATS_WR = [
    ["Metres", "Metros ganados"], ["Carries", "Portadas"], ["CleanBreaks", "Quiebres de línea"],
    ["DefendersBeaten", "Defensores superados"], ["Offload", "Offloads"], ["Tackles", "Tackles"],
    ["MissedTackles", "Tackles errados"], ["TurnoversWon", "Pelotas recuperadas"],
    ["PenaltiesConceded", "Penales cometidos"], ["LineoutsWon", "Lines ganados"], ["LineoutsLost", "Lines perdidos"],
    ["ScrumsWon", "Scrums ganados"], ["ScrumsLost", "Scrums perdidos"], ["KicksFromHand", "Patadas de juego"],
  ];

  async function datosWr(p) {
    const B = `${TR.WR}/${p.wrMatchId}`;
    const [sum, tl, st] = await Promise.allSettled([getJSON(B + "/summary"), getJSON(B + "/timeline"), getJSON(B + "/stats")]);

    const formaciones = [[], []];
    const nombres = {};
    if (sum.status === "fulfilled") {
      (sum.value.teams || []).forEach((t, i) => {
        formaciones[i] = (t.teamList?.list || []).map((j) => {
          const nombre = j.player?.name?.display || "";
          if (j.player?.id) nombres[j.player.id] = nombre;
          if (j.player?.altId) nombres[j.player.altId] = nombre;
          return { num: Number(j.number), nombre, pos: j.position || "" };
        }).filter((j) => j.num).sort((a, b) => a.num - b.num);
      });
    }

    const eventos = tl.status === "fulfilled"
      ? (tl.value.timeline || []).map((e) => {
          const tipo = TIPO_WR[e.group];
          if (!tipo) return null;
          const seg = e.time?.secs || 0;
          return {
            tipo, lado: e.teamIndex, periodo: e.phase === "L2" || seg > 2400 ? 2 : 1,
            min: `${Math.max(1, Math.ceil(seg / 60))}'`, seg,
            jugador: nombres[e.playerId] || nombres[e.playerAltId] || "",
            puntos: e.points,
          };
        }).filter(Boolean)
      : [];

    let stats = [];
    if (st.status === "fulfilled") {
      const ts = st.value.teamStats || [];
      const a = ts[0]?.stats || {}, b = ts[1]?.stats || {};
      stats = STATS_WR.filter(([k]) => typeof a[k] === "number" && typeof b[k] === "number")
        .map(([k, label]) => [label, a[k], b[k]]);
    }

    return { eventos, formaciones, stats, ultimos: [[], []], h2h: [] };
  }

  // ---------- Render ----------
  function htmlEventos(p, eventos) {
    if (!eventos.length) return "";
    eventos.sort((a, b) => a.periodo - b.periodo || a.seg - b.seg);
    let marc = [0, 0];
    let html = "";
    let periodoAnterior = 1;
    eventos.forEach((e) => {
      if (e.periodo !== periodoAnterior) {
        html += `<div class="ev-entre">Entretiempo · ${marc[0]} - ${marc[1]}</div>`;
        periodoAnterior = e.periodo;
      }
      marc[e.lado] += e.puntos ?? PUNTOS[e.tipo];
      const txt = `<span class="ev-ic">${ICONO[e.tipo]}</span><span class="ev-txt"><b>${NOMBRE[e.tipo]}</b>${e.jugador ? `<small>${esc(e.jugador)}</small>` : ""}</span>`;
      html += `
        <div class="ev">
          <div class="ev-lado ev-l">${e.lado === 0 ? txt : ""}</div>
          <div class="ev-min">${esc(e.min)}</div>
          <div class="ev-lado ev-v">${e.lado === 1 ? txt : ""}</div>
        </div>`;
    });
    return `<div class="eventos">${html}</div>`;
  }

  function htmlFormaciones(p, f) {
    if (!f[0].length && !f[1].length) return "";
    const col = (lista, nombre) => `
      <div class="form-col">
        <h4>${esc(nombre)}</h4>
        ${lista.filter((j) => j.num <= 15).map(fila).join("")}
        ${lista.some((j) => j.num > 15) ? `<div class="form-sub">Suplentes</div>${lista.filter((j) => j.num > 15).map(fila).join("")}` : ""}
      </div>`;
    const fila = (j) => `<div class="jug"><span class="num">${j.num}</span><span class="jn">${esc(j.nombre)}</span></div>`;
    return `<div class="formaciones">${col(f[0], p.local.nombre)}${col(f[1], p.visita.nombre)}</div>`;
  }

  function htmlStats(stats) {
    if (!stats.length) return "";
    return `<div class="stats">${stats.map(([label, a, b]) => {
      const tot = a + b || 1;
      return `
        <div class="st">
          <div class="st-num">${Math.round(a)}</div>
          <div class="st-mid"><div class="st-lbl">${esc(label)}</div>
            <div class="st-bar"><span style="width:${(a / tot) * 100}%"></span><span style="width:${(b / tot) * 100}%"></span></div>
          </div>
          <div class="st-num">${Math.round(b)}</div>
        </div>`;
    }).join("")}</div>`;
  }

  function htmlHistorial(p, ultimos, h2h) {
    const bloque = (titulo, lista) => !lista.length ? "" : `
      <div class="hist-col">
        <h4>${esc(titulo)}</h4>
        ${lista.map((g) => `
          <div class="hist-row">
            <span class="res res-${esc(g.res)}">${esc(g.res)}</span>
            <span class="hist-fecha">${fechaCorta(g.fecha)}</span>
            <span class="hist-rival">${g.local ? "vs" : "en"} ${esc(g.rival)}</span>
            <span class="hist-marc">${esc(g.marcador)}</span>
          </div>`).join("")}
      </div>`;
    const u = bloque("Últimos: " + p.local.nombre, ultimos[0]) + bloque("Últimos: " + p.visita.nombre, ultimos[1]);
    const h = !h2h.length ? "" : `
      <div class="hist-col full">
        <h4>Enfrentamientos anteriores</h4>
        ${h2h.map((g) => `
          <div class="hist-row">
            <span class="hist-fecha">${fechaCorta(g.fecha)}</span>
            <span class="hist-rival">${esc(g.local)} vs ${esc(g.visita)}</span>
            <span class="hist-marc">${esc(g.marcador)}</span>
          </div>`).join("")}
      </div>`;
    return u || h ? `<div class="historial">${u}${h}</div>` : "";
  }

  function cabecera(p) {
    const fecha = p.inicio.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
    const marcador = p.estado === "pre" || p.cancelado
      ? `<div class="cab-hora">${horaArg(p.inicio)}</div>`
      : `<div class="cab-score ${p.estado === "in" ? "envivo" : ""}">${esc(p.local.score)} - ${esc(p.visita.score)}</div>`;
    const escudo = (t) => TR.BANDERAS[t.nombre]
      ? `<div class="cab-ic">${TR.BANDERAS[t.nombre]}</div>`
      : t.logo ? `<img class="cab-logo" src="${esc(t.logo)}" alt="">` : `<div class="cab-ic"></div>`;
    const tv = p.tv
      ? `${TR.pillsTv(p)}${p.tv.fuente ? ` <a href="${esc(p.tv.fuente)}" target="_blank" rel="noopener">fuente</a>` : ""}`
      : `<span class="suave">TV: sin confirmación oficial todavía</span>`;
    return `<div class="cab-hero">
      <div class="cab-top">
        <span class="suave">${esc(p.liga.nombre)}${p.ronda ? " · " + esc(p.ronda) : ""}</span>
        <form method="dialog"><button class="cerrar" aria-label="Cerrar">✕</button></form>
      </div>
      <div class="cab">
        <div class="cab-eq">${escudo(p.local)}<span>${esc(p.local.nombre)}</span></div>
        <div class="cab-centro">${marcador}<div class="cab-estado ${p.estado === "in" ? "vivo" : ""}">${esc(p.cancelado ? "Suspendido" : p.estadoTxt)}</div></div>
        <div class="cab-eq">${escudo(p.visita)}<span>${esc(p.visita.nombre)}</span></div>
      </div>
      <div class="cab-info">
        <div>${fecha} · ${horaArg(p.inicio)} (ARG)${p.sede ? " · " + esc(p.sede) : ""}</div>
        <div class="cab-tv">${tv}</div>
      </div></div>`;
  }

  let abierto = null;
  let timer = null;
  let pestaña = "resumen";

  async function cargar(p, primera) {
    if (primera) {
      $d.innerHTML = cabecera(p) + `<div class="det-cuerpo"><div class="vacio-msg">Cargando detalle…</div></div>`;
    }
    let datos;
    try {
      if (p.fuente === "ESPN") datos = await datosEspn(p);
      else if (p.wrMatchId) datos = await datosWr(p);
      else {
        // BBC no publica detalle: se usa el mismo partido de World Rugby si está
        const g = TR.gemeloWr(p);
        datos = g ? await datosWr(g) : { eventos: [], formaciones: [[], []], stats: [], ultimos: [], h2h: [] };
      }
    } catch {
      if (abierto !== p) return;
      $d.querySelector(".det-cuerpo").innerHTML = `<div class="vacio-msg">No se pudo cargar el detalle.</div>`;
      return;
    }
    if (abierto !== p) return;

    const tabs = [
      ["resumen", "Resumen", htmlEventos(p, datos.eventos)],
      ["formaciones", "Formaciones", htmlFormaciones(p, datos.formaciones)],
      ["stats", "Estadísticas", htmlStats(datos.stats)],
      ["historial", "Historial", htmlHistorial(p, datos.ultimos, datos.h2h)],
    ].filter((t) => t[2]);

    // Refresca la cabecera (marcador/estado pueden haber cambiado)
    $d.innerHTML = cabecera(p) + `<div class="det-cuerpo"></div>`;
    const $c = $d.querySelector(".det-cuerpo");
    if (!tabs.length) {
      $c.innerHTML = `<div class="vacio-msg">${p.estado === "pre"
        ? "Todavía no hay formaciones ni datos de este partido. Se completan cuando la fuente los publique."
        : "La fuente no publicó detalle de este partido."}</div>`;
      return;
    }
    if (!tabs.some((t) => t[0] === pestaña)) pestaña = tabs[0][0];
    $c.innerHTML = `
      <div class="det-tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === pestaña ? "activa" : ""}">${n}</button>`).join("")}</div>
      ${tabs.map(([k, , html]) => `<div class="det-panel" data-panel="${k}" ${k === pestaña ? "" : "hidden"}>${html}</div>`).join("")}
      <div class="det-fuente">Fuente: ${esc(p.fuente)}</div>`;
  }

  $d.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    pestaña = b.dataset.tab;
    $d.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("activa", x === b));
    $d.querySelectorAll("[data-panel]").forEach((x) => (x.hidden = x.dataset.panel !== pestaña));
  });
  $d.addEventListener("close", () => { abierto = null; clearInterval(timer); });

  TR.abrirDetalle = (p) => {
    abierto = p;
    pestaña = "resumen";
    $d.className = "grande";
    $d.showModal();
    cargar(p, true);
    clearInterval(timer);
    // En vivo: actualiza el detalle cada 30 s mientras está abierto
    timer = setInterval(() => {
      const actual = TR.partidos.get(p.id) || p;
      if (abierto && actual.estado === "in") { abierto = actual; cargar(actual, false); }
    }, 30 * 1000);
  };
})();
