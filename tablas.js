// Tablas de posiciones.
// ESPN: endpoint "standings" (se pide la temporada actual explícitamente, porque por defecto
// algunas ligas devuelven temporadas viejas). World Rugby: "event/{id}/standings".
// Una tabla solo se muestra si pasa los controles: temporada correcta, datos coherentes y al día.
(() => {
  const TR = window.TR;
  const { esc, getJSON, TZ } = TR;
  const cache = new Map(); // clave liga -> {t, html}

  const anioDeTemporada = (s) => {
    // "2026-27" -> 2027, "2027" -> 2027
    const m = String(s || "").match(/(\d{4})(?:[-/](\d{2,4}))?/);
    if (!m) return 0;
    if (!m[2]) return +m[1];
    return m[2].length === 2 ? +(m[1].slice(0, 2) + m[2]) : +m[2];
  };

  // ---------- ESPN ----------
  async function tablaEspn(liga) {
    const anio = new Date().getFullYear();
    const urls = ["", `&season=${anio}`, `&season=${anio + 1}`].map(
      (q) => `https://site.api.espn.com/apis/v2/sports/rugby/${liga.id}/standings?lang=es&region=ar${q}`
    );
    const res = await Promise.allSettled(urls.map(getJSON));
    if (res.every((r) => r.status === "rejected")) return { error: "ESPN no responde en este momento; la tabla aparece cuando vuelva." };
    // Quedarse con la temporada más reciente que tenga equipos
    let mejor = null;
    res.forEach((r) => {
      if (r.status !== "fulfilled") return;
      const grupos = (r.value.children || []).filter((g) => g.standings?.entries?.length);
      if (!grupos.length) return;
      const temp = grupos[0].standings.seasonDisplayName || "";
      const k = anioDeTemporada(temp);
      if (!mejor || k > mejor.k) mejor = { k, temp, grupos, total: (r.value.children || []).length };
    });
    if (!mejor) return { error: "ESPN no publica tabla de posiciones para este torneo." };

    // Ligas con conferencias fijas que ESPN mezcla en una sola lista
    if (liga.divisiones && mejor.grupos.length === 1) {
      const entradas = mejor.grupos[0].standings.entries;
      mejor.grupos = Object.entries(liga.divisiones).map(([name, equipos]) => ({
        name, standings: { entries: entradas.filter((e) => equipos.includes(e.team.displayName)) },
      }));
      const ubicados = mejor.grupos.reduce((s, g) => s + g.standings.entries.length, 0);
      if (ubicados !== entradas.length) return { error: "La tabla de ESPN no coincide con el formato del torneo; no se muestra para evitar errores." };
    }

    const val = (e, n) => {
      const s = e.stats.find((x) => x.name === n);
      if (!s) return 0;
      return typeof s.value === "number" ? s.value : Number(s.displayValue) || 0;
    };
    const tablas = mejor.grupos.map((g) => ({
      // Si la fuente agrupa todo en un solo grupo (ej. Nations Championship), no se usa su nombre
      titulo: mejor.grupos.length === 1 && mejor.total > 1 ? "Tabla general" : mejor.grupos.length > 1 ? g.name : "",
      filas: g.standings.entries.map((e) => ({
        pos: val(e, "rank") || "",
        equipo: e.team.displayName,
        logo: e.team.logos?.[0]?.href,
        pj: val(e, "gamesPlayed"), g: val(e, "gamesWon"), e: val(e, "gamesDrawn"), p: val(e, "gamesLost"),
        dif: val(e, "pointsDifference"), pb: val(e, "bonusPoints"), pts: val(e, "points"),
      })).sort((a, b) => (a.pos || 99) - (b.pos || 99)),
    }));

    // Control de coherencia: en total, ganados = perdidos y los partidos jugados cierran
    const todas = tablas.flatMap((t) => t.filas);
    const G = todas.reduce((s, f) => s + f.g, 0), P = todas.reduce((s, f) => s + f.p, 0);
    const E = todas.reduce((s, f) => s + f.e, 0), PJ = todas.reduce((s, f) => s + f.pj, 0);
    if (G !== P || G + P + E !== PJ) return { error: "Los datos de la tabla de ESPN no cierran; no se muestran para evitar errores." };

    // Ligas de clubes europeas: ESPN dice "2027" para la temporada 2026-27
    let temporada = mejor.temp;
    if (liga.grupo === "Clubes" && /^\d{4}$/.test(temporada)) temporada = `${temporada - 1}-${temporada.slice(2)}`;
    return { temporada, tablas, fuente: "ESPN" };
  }

  // ---------- World Rugby ----------
  async function tablaWr(liga) {
    const p = [...TR.partidos.values()].find((x) => x.liga.clave === liga.clave && x.wrEventoId);
    if (!p) return { error: "No hay partidos próximos de este torneo para ubicar su tabla." };
    const B = `https://api.wr-rims-prod.pulselive.com/rugby/v3/event/${p.wrEventoId}`;
    const [st, cal] = await Promise.all([getJSON(B + "/standings"), getJSON(B + "/schedule")]);
    const tablasWr = (st.tables || []).filter((t) => t.entries?.length);
    if (!tablasWr.length) return { error: "World Rugby no publica tabla de posiciones para este torneo." };

    // Control de actualización: si hubo un partido terminado después de generada la tabla, está vieja
    const generada = Math.min(...tablasWr.map((t) => t.lastGenerated?.millis || 0));
    const partidosCal = Array.isArray(cal) ? cal : cal.matches || cal.content || [];
    const ultimoJugado = Math.max(0, ...partidosCal.filter((m) => m.status === "C").map((m) => m.time?.millis || 0));
    if (ultimoJugado > generada + 3 * 60 * 60 * 1000) {
      return { error: "World Rugby todavía no actualizó la tabla después de los últimos partidos." };
    }

    return {
      temporada: st.event?.label?.match(/\d{4}/)?.[0] || "",
      fuente: "World Rugby",
      actualizada: generada,
      tablas: tablasWr.map((t) => ({
        titulo: tablasWr.length > 1 ? (t.shortLabel ? `Grupo ${t.shortLabel}` : t.label || "") : "",
        filas: t.entries.map((e) => ({
          pos: Number(e.positionLabel) || "",
          equipo: TR.nombreEs(e.team?.name || ""),
          pj: e.played, g: e.won, e: e.drawn, p: e.lost,
          dif: (e.pointsFor || 0) - (e.pointsAgainst || 0), pb: e.bonusPoints, pts: e.points,
        })),
      })),
    };
  }

  // ---------- Render ----------
  function htmlTabla(d) {
    const ic = (f) => TR.iconoEquipo({ nombre: f.equipo, logo: f.logo });
    const fmtDif = (n) => (n > 0 ? "+" + n : String(n));
    const actualizada = d.actualizada
      ? ` · actualizada ${new Date(d.actualizada).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", timeZone: TZ })}` : "";
    return d.tablas.map((t) => `
      <section class="comp">
        <h2>${esc(t.titulo || "Posiciones")}${d.temporada ? ` · Temporada ${esc(d.temporada)}` : ""}</h2>
        <div class="tabla-scroll">
          <table class="tabla">
            <thead><tr><th>#</th><th class="eq">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>Dif</th><th>PB</th><th>Pts</th></tr></thead>
            <tbody>${t.filas.map((f) => `
              <tr class="${f.equipo.startsWith("Argentina") ? "pumas" : ""}">
                <td>${esc(f.pos)}</td>
                <td class="eq"><div class="eq-in">${ic(f)}<span>${esc(f.equipo)}</span></div></td>
                <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td>
                <td>${fmtDif(f.dif)}</td><td>${f.pb ?? "-"}</td><td class="pts">${f.pts}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>`).join("") + `<div class="det-fuente">Fuente: ${esc(d.fuente)}${actualizada}</div>`;
  }

  async function cargarTabla(liga) {
    const c = cache.get(liga.clave);
    if (c && Date.now() - c.t < 10 * 60 * 1000) return c.html;
    // BBC no publica tablas; si ESPN no responde, se usa la tabla de World Rugby de esa liga
    const espn = liga.fuente === "espn" ? liga : TR.ligas.find((l) => l.clave === liga.respaldoDe && l.fuente === "espn");
    const wr = liga.fuente === "wr" ? liga : TR.ligas.find((l) => l.fuente === "wr" && l.respaldoDe && l.respaldoDe === (espn?.clave));
    let d;
    try {
      d = espn ? await tablaEspn(espn) : await tablaWr(wr);
    } catch {
      try {
        if (!espn || !wr) throw 0;
        d = await tablaWr(wr);
      } catch {
        return `<div class="vacio-msg">No se pudo cargar la tabla. Probá de nuevo en un rato.</div>`;
      }
    }
    const html = d.error ? `<div class="vacio-msg">${esc(d.error)}</div>` : htmlTabla(d);
    cache.set(liga.clave, { t: Date.now(), html });
    return html;
  }

  TR.tablaLiga = cargarTabla;
})();
