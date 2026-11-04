// Ligas que muestra la app. Todo se lee en tiempo real de estas fuentes:
//  - "espn": API pública de ESPN (id = ID de liga en ESPN)
//  - "bbc":  BBC Sport (urn = nombre del torneo en BBC)
//  - "tsdb": TheSportsDB (id = ID de liga en TheSportsDB)
//  - "wr":   API oficial de World Rugby (patron = comienzo del nombre del torneo en World Rugby)
// "activa": si la liga se muestra o no.
// Si un partido aparece en las dos fuentes, se muestra una sola vez (gana ESPN).
// "respaldoDe": la misma liga en otra fuente; solo se usa si ESPN no responde para esa liga.
// Orden de preferencia: ESPN, después BBC, después TheSportsDB, después World Rugby.
window.LIGAS = [
  // Selecciones
  { grupo: "Selecciones", clave: "nations",   fuente: "espn", id: "17567",  nombre: "Nations Championship", activa: true,
    // Formato del torneo: dos conferencias fijas (ESPN las devuelve mezcladas en una sola tabla)
    divisiones: {
      "Hemisferio Norte": ["Inglaterra", "Francia", "Irlanda", "Escocia", "Gales", "Italia"],
      "Hemisferio Sur": ["Sudáfrica", "Nueva Zelanda", "Australia", "Argentina", "Fiji", "Japón"],
    } },
  { grupo: "Selecciones", clave: "bbc-nations", fuente: "bbc", urn: "nations-championship", nombre: "Nations Championship", activa: true, respaldoDe: "nations" },
  { grupo: "Selecciones", clave: "wr-nations", fuente: "wr", patron: "Nations Championship", nombre: "Nations Championship", activa: true, respaldoDe: "nations" },
  { grupo: "Selecciones", clave: "tests",     fuente: "espn", id: "289234", nombre: "Test Matches", activa: true },
  { grupo: "Selecciones", clave: "wr-tests",  fuente: "wr", patron: "Men's Internationals", nombre: "Test Matches", activa: true },
  { grupo: "Selecciones", clave: "wr-ncup",   fuente: "wr", patron: "World Rugby Nations Cup", nombre: "World Rugby Nations Cup", activa: true },
  { grupo: "Selecciones", clave: "trc",       fuente: "espn", id: "244293", nombre: "Rugby Championship", activa: true },
  { grupo: "Selecciones", clave: "bbc-trc", fuente: "bbc", urn: "rugby-championship", nombre: "Rugby Championship", activa: true, respaldoDe: "trc" },
  { grupo: "Selecciones", clave: "wr-trc", fuente: "wr", patron: "The Rugby Championship", nombre: "Rugby Championship", activa: true, respaldoDe: "trc" },
  { grupo: "Selecciones", clave: "6n",        fuente: "espn", id: "180659", nombre: "Seis Naciones", activa: true },
  { grupo: "Selecciones", clave: "bbc-6n", fuente: "bbc", urn: "six-nations", nombre: "Seis Naciones", activa: true, respaldoDe: "6n" },
  { grupo: "Selecciones", clave: "wr-6n", fuente: "wr", patron: "Six Nations", nombre: "Seis Naciones", activa: true, respaldoDe: "6n" },
  { grupo: "Selecciones", clave: "wr-bled",   fuente: "wr", patron: "Bledisloe Cup", nombre: "Bledisloe Cup", activa: true },
  { grupo: "Selecciones", clave: "mundial",   fuente: "espn", id: "164205", nombre: "Mundial de Rugby", activa: true },
  { grupo: "Selecciones", clave: "bbc-mundial", fuente: "bbc", urn: "rugby-world-cup", nombre: "Mundial de Rugby", activa: true, respaldoDe: "mundial" },
  { grupo: "Selecciones", clave: "wr-mundial", fuente: "wr", patron: "Men's Rugby World Cup", nombre: "Mundial de Rugby", activa: true, respaldoDe: "mundial" },
  { grupo: "Selecciones", clave: "wr-u20-6n", fuente: "wr", patron: "U20 Six Nations", nombre: "Seis Naciones U20", activa: false },
  { grupo: "Selecciones", clave: "wr-reu",    fuente: "wr", patron: "Rugby Europe Championship Men", nombre: "Rugby Europe Championship", activa: false },
  { grupo: "Selecciones", clave: "wr-retr",   fuente: "wr", patron: "Rugby Europe Trophy Men", nombre: "Rugby Europe Trophy", activa: false },
  { grupo: "Selecciones", clave: "wr-reco",   fuente: "wr", patron: "Rugby Europe Conference Men", nombre: "Rugby Europe Conference", activa: false },

  // Argentina
  { grupo: "Argentina", clave: "urba",        fuente: "espn", id: "289279", nombre: "URBA Top 14", activa: true },
  { grupo: "Argentina", clave: "tsdb-urba",   fuente: "tsdb", id: "5165", nombre: "URBA Top 14", activa: true, respaldoDe: "urba" },

  // Clubes
  { grupo: "Clubes", clave: "top14",      fuente: "espn", id: "270559", nombre: "Top 14 (Francia)", activa: true },
  { grupo: "Clubes", clave: "bbc-top14", fuente: "bbc", urn: "top-14", nombre: "Top 14 (Francia)", activa: true, respaldoDe: "top14" },
  { grupo: "Clubes", clave: "wr-top14", fuente: "wr", patron: "Top 14", nombre: "Top 14 (Francia)", activa: true, respaldoDe: "top14" },
  { grupo: "Clubes", clave: "prem",       fuente: "espn", id: "267979", nombre: "Premiership (Inglaterra)", activa: true },
  { grupo: "Clubes", clave: "bbc-prem", fuente: "bbc", urn: "english-premiership", nombre: "Premiership (Inglaterra)", activa: true, respaldoDe: "prem" },
  { grupo: "Clubes", clave: "wr-prem", fuente: "wr", patron: "English Premiership", nombre: "Premiership (Inglaterra)", activa: true, respaldoDe: "prem" },
  { grupo: "Clubes", clave: "champions",  fuente: "espn", id: "271937", nombre: "Champions Cup", activa: true },
  { grupo: "Clubes", clave: "bbc-champions", fuente: "bbc", urn: "european-cup", nombre: "Champions Cup", activa: true, respaldoDe: "champions" },
  { grupo: "Clubes", clave: "wr-champions", fuente: "wr", patron: "EPCR Champions Cup", nombre: "Champions Cup", activa: true, respaldoDe: "champions" },
  { grupo: "Clubes", clave: "challenge",  fuente: "espn", id: "272073", nombre: "Challenge Cup", activa: true },
  { grupo: "Clubes", clave: "bbc-challenge", fuente: "bbc", urn: "european-challenge-cup", nombre: "Challenge Cup", activa: true, respaldoDe: "challenge" },
  { grupo: "Clubes", clave: "wr-challenge", fuente: "wr", patron: "EPCR Challenge Cup", nombre: "Challenge Cup", activa: true, respaldoDe: "challenge" },
  { grupo: "Clubes", clave: "srp",        fuente: "espn", id: "242041", nombre: "Super Rugby Pacific", activa: true },
  { grupo: "Clubes", clave: "bbc-srp", fuente: "bbc", urn: "super-rugby", nombre: "Super Rugby Pacific", activa: true, respaldoDe: "srp" },
  { grupo: "Clubes", clave: "wr-srp", fuente: "wr", patron: "Super Rugby Pacific", nombre: "Super Rugby Pacific", activa: true, respaldoDe: "srp" },
  { grupo: "Clubes", clave: "mlr",        fuente: "espn", id: "289262", nombre: "Major League Rugby", activa: false },
  { grupo: "Clubes", clave: "wr-premcup", fuente: "wr", patron: "Premiership Rugby Cup", nombre: "Premiership Rugby Cup", activa: false },
  { grupo: "Clubes", clave: "wr-prod2",   fuente: "wr", patron: "Pro D2", nombre: "Pro D2 (Francia)", activa: false },
  { grupo: "Clubes", clave: "wr-champ",   fuente: "wr", patron: "English Championship", nombre: "Championship (Inglaterra)", activa: false },
  { grupo: "Clubes", clave: "wr-seriea",  fuente: "wr", patron: "Serie A Elite", nombre: "Serie A Elite (Italia)", activa: false },
  { grupo: "Clubes", clave: "wr-coppa",   fuente: "wr", patron: "Coppa Italia", nombre: "Coppa Italia", activa: false },
];

// Nombres en castellano para equipos que World Rugby publica en inglés.
window.NOMBRES_ES = {
  "Argentina": "Argentina", "Argentina XV": "Argentina XV", "Ireland": "Irlanda", "Italy": "Italia",
  "South Africa": "Sudáfrica", "Scotland": "Escocia", "New Zealand": "Nueva Zelanda", "Wales": "Gales",
  "Japan": "Japón", "France": "Francia", "Fiji": "Fiji", "England": "Inglaterra", "England A": "Inglaterra A",
  "Australia": "Australia", "Uruguay": "Uruguay", "Chile": "Chile", "Georgia": "Georgia", "Samoa": "Samoa",
  "Tonga": "Tonga", "Portugal": "Portugal", "Spain": "España", "Romania": "Rumania", "USA": "Estados Unidos",
  "Canada": "Canadá", "Brazil": "Brasil", "Paraguay": "Paraguay", "Hong Kong China": "Hong Kong",
  "Zimbabwe": "Zimbabue", "Namibia": "Namibia", "Belgium": "Bélgica", "Netherlands": "Países Bajos",
  "Germany": "Alemania", "Russia": "Rusia", "Kenya": "Kenia", "Peru": "Perú", "Colombia": "Colombia",
  "Mexico": "México", "Pakistan": "Pakistán", "Uzbekistan": "Uzbekistán", "Cayman Islands": "Islas Caimán",
  "Switzerland": "Suiza", "Poland": "Polonia", "Sweden": "Suecia",
};

// Partidos internacionales: solo se muestran los que juega alguna de estas selecciones
// (top 15 del ranking oficial de World Rugby al 3/11/2026). Tiene que ser el equipo mayor:
// "Argentina XV" o "Inglaterra A" no cuentan.
window.TOP_SELECCIONES = [
  "Sudáfrica", "Nueva Zelanda", "Irlanda", "Francia", "Inglaterra", "Escocia", "Australia", "Argentina",
  "Fiji", "Gales", "Italia", "Japón", "Georgia", "Portugal", "Estados Unidos", "EE. UU.", "EEUU", "USA",
];

// Transmisión en Argentina: SOLO partidos confirmados por fuente oficial
// (ej. la grilla semanal "ATENCIÓN ARGENTINA" de latinamerica.espnpressroom.com).
// Clave = ID del partido (se ve en el detalle de cada partido en la app).
// Si un partido no está acá, la app no muestra canal.
window.TV_CONFIRMADA = {
  // "espn:603993": { canales: ["ESPN 2", "Disney+ Premium"], fuente: "https://latinamerica.espnpressroom.com/..." },
};

window.COLORES_CANAL = {
  "ESPN": "#c8102e", "ESPN 2": "#c8102e", "ESPN 3": "#c8102e", "ESPN 4": "#c8102e",
  "Disney+ Premium": "#113ccf", "TyC Sports": "#e30613",
};
