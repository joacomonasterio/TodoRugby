#!/usr/bin/env python3
"""Genera datos-fijos.js: una copia guardada de todos los partidos que publican
ESPN, BBC Sport, World Rugby y TheSportsDB, para que la app los muestre aunque esas
fuentes no respondan. Aplica las mismas reglas que app.js (solo rugby masculino
de 15, sin seven, sin horarios sin confirmar).

Si una fuente no responde, se conservan los partidos que ya estaban guardados de esa fuente.
Lo corre GitHub Actions cada hora (.github/workflows/actualizar.yml).

Uso:  python3 herramientas/generar_fijos.py
"""
import datetime as dt
import json
import pathlib
import re
import subprocess
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
HASTA = "2027-12-31"

# Ligas y nombres en castellano, leídos de config.js
conf = json.loads(subprocess.check_output(
    ["node", "-e", "global.window={};require(process.argv[1]);"
     "console.log(JSON.stringify({ligas:window.LIGAS,nombres:window.NOMBRES_ES}))",
     str(RAIZ / "config.js")]))
LIGAS = [l for l in conf["ligas"] if l.get("activa")]
NOMBRES = conf["nombres"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return json.load(urllib.request.urlopen(req, timeout=40))


def nombre_es(n):
    m = re.match(r"^(Northern|Southern) (\d+)$", n or "")
    if m:
        return f"{m.group(2)}º Hemisferio {'Norte' if m.group(1) == 'Northern' else 'Sur'}"
    return NOMBRES.get(n, n)


def excluido(n):
    n = n or ""
    return bool(re.search(r"femenin|women|woman|ladies|\(W\)|\bW$", n, re.I) or re.search(r"seven|\b7s\b|svns", n, re.I))


def equipo(nombre, score=None, logo=None):
    e = {"nombre": nombre or "A definir"}
    if score not in (None, ""):
        e["score"] = str(score)
    if logo:
        e["logo"] = logo
    return e


hoy = dt.date.today().isoformat()
partidos = []
fallaron = []  # prefijos de id de las fuentes que no respondieron


def fuente(prefijo):
    """Decorador: si la fuente falla, se anota y se sigue con las demás."""
    def envolver(fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            print(f"{prefijo}: no respondió ({e}); se conservan sus datos anteriores")
            global partidos
            partidos = [p for p in partidos if not p["id"].startswith(prefijo + ":")]
            fallaron.append(prefijo)
        return fn
    return envolver


# ---------- ESPN ----------
@fuente("espn")
def _espn():
    y, m = map(int, hoy.split("-")[:2])
    meses = [f"{y + (m - 1 + i) // 12}{(m - 1 + i) % 12 + 1:02d}" for i in range(4)]
    for liga in (l for l in LIGAS if l["fuente"] == "espn"):
        for mes in meses:
            j = get(f"https://site.api.espn.com/apis/site/v2/sports/rugby/{liga['id']}/scoreboard?dates={mes}&limit=500&lang=es&region=ar")
            for e in j.get("events") or []:
                c = e["competitions"][0]
                if c.get("timeValid") is False:
                    continue  # horario sin confirmar
                def eq(lado):
                    x = next((t for t in c["competitors"] if t.get("homeAway") == lado), {})
                    return equipo((x.get("team") or {}).get("displayName"), x.get("score") if c["status"]["type"]["state"] != "pre" else None,
                                  (x.get("team") or {}).get("logo"))
                loc, vis = eq("home"), eq("away")
                if excluido(loc["nombre"]) or excluido(vis["nombre"]) or re.search(r"seven|\b7s\b|svns", e.get("name") or "", re.I):
                    continue
                st = c["status"]["type"]
                venue = c.get("venue") or {}
                partidos.append({
                    "id": "espn:" + e["id"], "liga": liga["clave"],
                    "inicio": int(dt.datetime.fromisoformat(e["date"].replace("Z", "+00:00")).timestamp() * 1000),
                    "local": loc, "visita": vis,
                    "ronda": (e.get("week") or {}).get("text") or ((c.get("notes") or [{}])[0].get("headline") or ""),
                    "estado": st["state"], "estadoTxt": st.get("shortDetail") or st.get("description") or "",
                    "cancelado": bool(re.search("CANCELED|POSTPONED|ABANDONED", st.get("name") or "")),
                    "sede": ", ".join(x for x in [venue.get("fullName"), (venue.get("address") or {}).get("city")] if x),
                    "fuente": "ESPN", "espnId": e["id"],
                })


# ---------- World Rugby ----------
@fuente("wr")
def _wr():
    ligas_wr = [l for l in LIGAS if l["fuente"] == "wr"]
    pagina, total = 0, 1
    while pagina < total:
        j = get(f"https://api.wr-rims-prod.pulselive.com/rugby/v3/match?startDate={hoy}&endDate={HASTA}&sort=asc&pageSize=100&page={pagina}")
        total = j["pageInfo"]["numPages"]
        pagina += 1
        for m in j["content"]:
            if (m.get("sport") or "").upper() != "MRU":
                continue
            comp = m.get("competition") or ""
            if excluido(comp) or any(excluido(t.get("name")) for t in m.get("teams") or []):
                continue
            liga = next((l for l in ligas_wr if comp.startswith(l["patron"])), None)
            if not liga:
                continue
            t = m["time"]
            hora_sede = dt.datetime.utcfromtimestamp(t["millis"] / 1000 + (t.get("gmtOffset") or 0) * 3600).hour
            medianoche = t["millis"] == int(dt.datetime.fromisoformat(t["label"] + "T00:00:00+00:00").timestamp() * 1000)
            if m.get("status") == "U" and medianoche and hora_sede < 10:
                continue  # horario sin confirmar
            st = m.get("status") or "U"
            estado = "post" if st == "C" else "in" if st.startswith("L") else "pre"
            sc = m.get("scores") or [None, None]
            partidos.append({
                "id": "wr:" + m["matchId"], "liga": liga["clave"], "inicio": t["millis"],
                "local": equipo(nombre_es(m["teams"][0]["name"]), sc[0] if estado != "pre" else None),
                "visita": equipo(nombre_es(m["teams"][1]["name"]), sc[1] if estado != "pre" else None),
                "ronda": m.get("eventPhase") or "", "estado": estado,
                "estadoTxt": "Final" if estado == "post" else "Programado",
                "cancelado": bool(re.match(r"^(P|A|X|CC)$", st)),
                "sede": ", ".join(x for x in [(m.get("venue") or {}).get("name"), (m.get("venue") or {}).get("city")] if x),
                "fuente": "World Rugby", "wrMatchId": m["matchId"],
                "wrEventoId": (m.get("events") or [{}])[0].get("id"),
            })

# ---------- BBC Sport ----------
@fuente("bbc")
def _bbc():
    ligas_bbc = {l["urn"]: l for l in LIGAS if l["fuente"] == "bbc"}
    q = urllib.parse.urlencode({"selectedStartDate": hoy, "selectedEndDate": HASTA, "todayDate": hoy,
                                "urn": "urn:bbc:sportsdata:rugby-union", "useSdApi": "false"})
    j = get("https://web-cdn.api.bbci.co.uk/wc-poll-data/container/sport-data-scores-fixtures?" + q)
    for g in j.get("eventGroups", []):
        for s in g.get("secondaryGroups", []):
            for e in s.get("events", []):
                liga = ligas_bbc.get((e.get("tournament") or {}).get("urn", "").split(":")[-1])
                if not liga or re.search("TBC", (e.get("time") or {}).get("displayTimeUK", ""), re.I):
                    continue
                st = e.get("status") or ""
                estado = "post" if st == "PostEvent" else "in" if st == "MidEvent" else "pre"
                loc, vis = nombre_es(e["home"]["fullName"]), nombre_es(e["away"]["fullName"])
                if excluido(loc) or excluido(vis):
                    continue
                inicio = int(dt.datetime.fromisoformat(e["startDateTime"]).timestamp() * 1000)
                partidos.append({
                    "id": "bbc:" + e["id"], "liga": liga["clave"], "inicio": inicio,
                    "local": equipo(loc, e["home"].get("score") if estado != "pre" else None),
                    "visita": equipo(vis, e["away"].get("score") if estado != "pre" else None),
                    "ronda": "", "estado": estado, "estadoTxt": "Final" if estado == "post" else "Programado",
                    "cancelado": bool(re.search("Postponed|Cancelled|Abandoned", st, re.I)),
                    "sede": (e.get("venue") or {}).get("name") or "", "fuente": "BBC Sport",
                })

# ---------- TheSportsDB ----------
@fuente("tsdb")
def _tsdb():
    for liga in (l for l in LIGAS if l["fuente"] == "tsdb"):
        for f in ["eventsnextleague", "eventspastleague"]:
            for e in get(f"https://www.thesportsdb.com/api/v1/json/123/{f}.php?id={liga['id']}").get("events") or []:
                if not e.get("strTimestamp"):
                    continue
                st = e.get("strStatus") or "NS"
                estado = "post" if re.match(r"^(FT|AET|AOT|Match Finished)$", st, re.I) else "pre"
                if estado == "pre" and "T00:00:00" in e["strTimestamp"]:
                    continue
                inicio = int(dt.datetime.fromisoformat(e["strTimestamp"] + "+00:00").timestamp() * 1000)
                partidos.append({
                    "id": "tsdb:" + e["idEvent"], "liga": liga["clave"], "inicio": inicio,
                    "local": equipo(e["strHomeTeam"], e.get("intHomeScore"), e.get("strHomeTeamBadge")),
                    "visita": equipo(e["strAwayTeam"], e.get("intAwayScore"), e.get("strAwayTeamBadge")),
                    "ronda": "", "estado": estado, "estadoTxt": "Final" if estado == "post" else "Programado",
                    "cancelado": e.get("strPostponed") == "yes", "sede": e.get("strVenue") or "",
                    "fuente": "TheSportsDB",
                })

# Fuentes que fallaron: se conservan sus partidos del archivo anterior
anterior = RAIZ / "datos-fijos.js"
if fallaron and anterior.exists():
    txt = anterior.read_text(encoding="utf-8")
    viejos = json.loads(txt[txt.index("partidos: ") + 10: txt.rindex(" };")])
    partidos += [p for p in viejos if p["id"].split(":")[0] in fallaron]

partidos.sort(key=lambda p: p["inicio"])
ahora = dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes")
salida = (
    "// Partidos guardados (generado por herramientas/generar_fijos.py; no editar a mano).\n"
    "// La app los usa solo cuando la fuente original no responde o el partido está fuera del período que carga en vivo.\n"
    f"window.DATOS_FIJOS = {{ generado: {json.dumps(ahora)}, partidos: "
    + json.dumps(partidos, ensure_ascii=False, separators=(",", ":"))
    + " };\n"
)
# Si los partidos son los mismos que ya estaban, no se reescribe el archivo
destino = RAIZ / "datos-fijos.js"
if destino.exists():
    txt = destino.read_text(encoding="utf-8")
    if json.loads(txt[txt.index("partidos: ") + 10: txt.rindex(" };")]) == partidos:
        print("Sin cambios en los partidos")
        raise SystemExit(0)
destino.write_text(salida, encoding="utf-8")
por_liga = {}
for p in partidos:
    por_liga[p["liga"]] = por_liga.get(p["liga"], 0) + 1
print(f"{len(partidos)} partidos guardados ->", por_liga)
