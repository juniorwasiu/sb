// ─────────────────────────────────────────────────────────────────────────────
// constants.js
//
// Single source of truth for league mappings, team-to-league associations,
// and canonical league detection across scrapers, analyzers, and database engines.
// ─────────────────────────────────────────────────────────────────────────────

// Maps dashboard / scraper league names → clean DB league name
const LEAGUE_MAP = {
    'England League': 'England - Virtual',
    'Spain League':   'Spain - Virtual',
    'Italy League':   'Italy - Virtual',
    'Germany League': 'Germany - Virtual',
    'France League':  'France - Virtual',
    'England':        'England - Virtual',
    'Spain':          'Spain - Virtual',
    'Italy':          'Italy - Virtual',
    'Germany':        'Germany - Virtual',
    'France':         'France - Virtual'
};

const LEAGUE_TAB_TEXT = {
    'England League': 'England',
    'Spain League':   'Spain',
    'Italy League':   'Italy',
    'Germany League': 'Germany',
    'France League':  'France',
};

const SUPPORTED_LEAGUES = ['England League', 'Spain League', 'Italy League', 'Germany League', 'France League'];

// Comprehensive Team-to-League Dictionary (Acronyms, Full Names, Alternate Names)
// Explicitly audited with zero collision across leagues
const TEAM_LEAGUES = {
    // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 England (Premier League)
    ARS: 'England', ARSENAL: 'England',
    CHE: 'England', CHELSEA: 'England',
    LIV: 'England', LIVERPOOL: 'England',
    MCI: 'England', 'MAN CITY': 'England', 'MANCHESTER CITY': 'England',
    MUN: 'England', 'MAN UTD': 'England', 'MANCHESTER UNITED': 'England',
    TOT: 'England', TOTTENHAM: 'England', SPURS: 'England',
    NEW: 'England', NEWCASTLE: 'England', 'NEWCASTLE UNITED': 'England',
    AST: 'England', AVL: 'England', 'ASTON VILLA': 'England', 'VILLA': 'England',
    BHA: 'England', BRI: 'England', BRIGHTON: 'England',
    BRE: 'England', BRENTFORD: 'England',
    CRY: 'England', 'CRYSTAL PALACE': 'England', PALACE: 'England',
    EVE: 'England', EVERTON: 'England',
    FUL: 'England', FULHAM: 'England',
    NFO: 'England', NOT: 'England', 'NOTTINGHAM FOREST': 'England', 'NOTTINGHAM': 'England', FOREST: 'England',
    WOL: 'England', WOLVES: 'England', WOLVERHAMPTON: 'England',
    BOU: 'England', BOURNEMOUTH: 'England',
    WHU: 'England', 'WEST HAM': 'England', 'WEST HAM UNITED': 'England',
    IPS: 'England', IPSWICH: 'England', 'IPSWICH TOWN': 'England',
    LEI: 'England', LEICESTER: 'England', 'LEICESTER CITY': 'England',
    SOU: 'England', SOUTHAMPTON: 'England',
    COV: 'England', COVENTRY: 'England',
    HUL: 'England', HULL: 'England',
    LEE: 'England', LEEDS: 'England',
    SUN: 'England', SUNDERLAND: 'England',
    BUR: 'England', BURNLEY: 'England',
    LUT: 'England', LUTON: 'England', 'LUTON TOWN': 'England',
    SHU: 'England', 'SHEFFIELD UNITED': 'England', 'SHEFFIELD': 'England',
    WAT: 'England', WATFORD: 'England',
    NOR: 'England', NORWICH: 'England',

    // 🇪🇸 Spain (La Liga)
    RMA: 'Spain', RMD: 'Spain', 'REAL MADRID': 'Spain',
    BAR: 'Spain', FCB: 'Spain', BARCELONA: 'Spain',
    ATM: 'Spain', ATL: 'Spain', 'ATLETICO MADRID': 'Spain', 'ATLETICO': 'Spain',
    SEV: 'Spain', SEVILLA: 'Spain',
    VIL: 'Spain', VILLARREAL: 'Spain',
    RSO: 'Spain', SOC: 'Spain', 'REAL SOCIEDAD': 'Spain', 'SOCIEDAD': 'Spain',
    BET: 'Spain', RBB: 'Spain', 'REAL BETIS': 'Spain', BETIS: 'Spain',
    ATH: 'Spain', BIL: 'Spain', 'ATHLETIC BILBAO': 'Spain', 'ATHLETIC CLUB': 'Spain',
    VAL: 'Spain', VCF: 'Spain', VALENCIA: 'Spain',
    CEL: 'Spain', 'CELTA VIGO': 'Spain', CELTA: 'Spain',
    GIR: 'Spain', GIRONA: 'Spain',
    OSA: 'Spain', OSASUNA: 'Spain',
    MAL: 'Spain', MLL: 'Spain', MALLORCA: 'Spain', 'RCD MALLORCA': 'Spain',
    GET: 'Spain', GETAFE: 'Spain',
    ALV: 'Spain', ALA: 'Spain', ALAVES: 'Spain', 'DEPORTIVO ALAVES': 'Spain',
    RAY: 'Spain', 'RAYO VALLECANO': 'Spain', RAYO: 'Spain',
    ESP: 'Spain', ESPANYOL: 'Spain',
    VLD: 'Spain', VLL: 'Spain', VALLADOLID: 'Spain', 'REAL VALLADOLID': 'Spain',
    LEG: 'Spain', LEGANES: 'Spain',
    LPA: 'Spain', LPV: 'Spain', 'LAS PALMAS': 'Spain',
    ELC: 'Spain', ELCHE: 'Spain',
    GRA: 'Spain', GRANADA: 'Spain',
    CAD: 'Spain', CADIZ: 'Spain',
    ALM: 'Spain', ALMERIA: 'Spain',

    // 🇮🇹 Italy (Serie A)
    INT: 'Italy', INZ: 'Italy', INTER: 'Italy', 'INTER MILAN': 'Italy', INTERNAZIONALE: 'Italy',
    ACM: 'Italy', MIL: 'Italy', MILAN: 'Italy', 'AC MILAN': 'Italy',
    JUV: 'Italy', JUVENTUS: 'Italy',
    NAP: 'Italy', NAPOLI: 'Italy',
    ROM: 'Italy', ROMA: 'Italy', 'AS ROMA': 'Italy',
    LAZ: 'Italy', LAZIO: 'Italy',
    ATA: 'Italy', ATALANTA: 'Italy',
    FIO: 'Italy', FIORENTINA: 'Italy',
    TOR: 'Italy', TORINO: 'Italy',
    BOL: 'Italy', BFC: 'Italy', BOLOGNA: 'Italy',
    MNZ: 'Italy', MONZA: 'Italy',
    GEN: 'Italy', GENOA: 'Italy',
    LEC: 'Italy', LECCE: 'Italy',
    UDI: 'Italy', UDINESE: 'Italy',
    CAG: 'Italy', CAGLIARI: 'Italy',
    VER: 'Italy', HEL: 'Italy', VERONA: 'Italy', 'HELLAS VERONA': 'Italy',
    EMP: 'Italy', EMPOLI: 'Italy',
    PAR: 'Italy', PARMA: 'Italy',
    COM: 'Italy', COMO: 'Italy',
    VEN: 'Italy', VENEZIA: 'Italy',
    FRO: 'Italy', FROSINONE: 'Italy',
    SAS: 'Italy', SASSUOLO: 'Italy',
    SAL: 'Italy', SALERNITANA: 'Italy',
    SAM: 'Italy', SAMPDORIA: 'Italy',

    // 🇩🇪 Germany (Bundesliga)
    BAY: 'Germany', BMU: 'Germany', 'BAYERN MUNICH': 'Germany', BAYERN: 'Germany',
    BVB: 'Germany', DOR: 'Germany', 'BORUSSIA DORTMUND': 'Germany', DORTMUND: 'Germany',
    RBL: 'Germany', 'RB LEIPZIG': 'Germany', LEIPZIG: 'Germany',
    LEV: 'Germany', B04: 'Germany', 'BAYER LEVERKUSEN': 'Germany', LEVERKUSEN: 'Germany',
    STU: 'Germany', VFB: 'Germany', 'VFB STUTTGART': 'Germany', STUTTGART: 'Germany',
    FRA: 'Germany', SGE: 'Germany', 'EINTRACHT FRANKFURT': 'Germany', FRANKFURT: 'Germany', EINTRACHT: 'Germany',
    WOB: 'Germany', WOLFSBURG: 'Germany',
    HOF: 'Germany', TSG: 'Germany', 'TSG HOFFENHEIM': 'Germany', HOFFENHEIM: 'Germany',
    BMG: 'Germany', GLA: 'Germany', 'BORUSSIA MONCHENGLADBACH': 'Germany', GLADBACH: 'Germany', MONCHENGLADBACH: 'Germany',
    AUG: 'Germany', FCA: 'Germany', AUGSBURG: 'Germany',
    SVW: 'Germany', WER: 'Germany', 'WERDER BREMEN': 'Germany', BREMEN: 'Germany',
    MAI: 'Germany', M05: 'Germany', MAINZ: 'Germany',
    BOC: 'Germany', BOCHUM: 'Germany',
    HEI: 'Germany', HEIDENHEIM: 'Germany',
    BER: 'Germany', FCU: 'Germany', 'UNION BERLIN': 'Germany',
    STP: 'Germany', 'ST PAULI': 'Germany', 'ST. PAULI': 'Germany',
    KIE: 'Germany', KSK: 'Germany', 'HOLSTEIN KIEL': 'Germany', KIEL: 'Germany',
    KOE: 'Germany', COL: 'Germany', 'FC KOLN': 'Germany', KOLN: 'Germany',
    SCH: 'Germany', SCHALKE: 'Germany',
    PAD: 'Germany', PADERBORN: 'Germany',
    SCF: 'Germany', FRE: 'Germany', FREIBURG: 'Germany', 'SC FREIBURG': 'Germany',
    HER: 'Germany', HERTHA: 'Germany',

    // 🇫🇷 France (Ligue 1)
    PSG: 'France', PARIS: 'France', 'PARIS SAINT-GERMAIN': 'France', 'PARIS SG': 'France',
    MAR: 'France', OLM: 'France', MARSEILLE: 'France', 'OLYMPIQUE DE MARSEILLE': 'France',
    LYO: 'France', LYN: 'France', LYON: 'France', 'OLYMPIQUE LYONNAIS': 'France',
    ASM: 'France', MONA: 'France', MONACO: 'France', 'AS MONACO': 'France',
    LIL: 'France', LOS: 'France', LOSC: 'France', LILLE: 'France',
    REN: 'France', SRF: 'France', RENNES: 'France', 'STADE RENNAIS': 'France',
    NIC: 'France', OGC: 'France', NICE: 'France', 'OGC NICE': 'France',
    LEN: 'France', RCL: 'France', LENS: 'France', 'RC LENS': 'France',
    STR: 'France', RCS: 'France', STRASBOURG: 'France', 'RC STRASBOURG': 'France',
    TOU: 'France', TFC: 'France', TOULOUSE: 'France',
    REI: 'France', SDR: 'France', REIMS: 'France', 'STADE DE REIMS': 'France',
    NAN: 'France', FCN: 'France', NANTES: 'France', 'FC NANTES': 'France',
    BRS: 'France', BREST: 'France', 'STADE BRESTOIS': 'France',
    AUX: 'France', AUXERRE: 'France',
    ANG: 'France', ANGERS: 'France', SCO: 'France',
    STE: 'France', ASSE: 'France', 'SAINT-ETIENNE': 'France',
    HAV: 'France', HAC: 'France', 'LE HAVRE': 'France',
    MET: 'France', METZ: 'France',
    LOR: 'France', LORIENT: 'France',
    MPL: 'France', MONTP: 'France', MONTPELLIER: 'France'
};

function normalizeTeamKey(name = '') {
    return String(name || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

/**
 * Authoritative League Detector:
 * Uses TEAM-FIRST detection rule: Virtual football teams strictly belong to their
 * own national leagues. If RMA or BAR is playing, it is ALWAYS Spain.
 */
function detectLeague(rawLeague = '', home = '', away = '') {
    const hKey = normalizeTeamKey(home);
    const aKey = normalizeTeamKey(away);

    // 1. Direct key match (e.g. RMA, BAR, ARS, BAY, PSG)
    const inferred = TEAM_LEAGUES[hKey] || TEAM_LEAGUES[aKey];
    if (inferred) {
        return `${inferred} - Virtual`;
    }

    // 2. Substring matching in team names (longer keys first for precision)
    const sortedTeams = Object.keys(TEAM_LEAGUES).sort((a, b) => b.length - a.length);
    for (const teamKey of sortedTeams) {
        const league = TEAM_LEAGUES[teamKey];
        if (hKey && (hKey === teamKey || (teamKey.length >= 4 && hKey.includes(teamKey)) || (hKey.length >= 4 && teamKey.includes(hKey)))) {
            return `${league} - Virtual`;
        }
        if (aKey && (aKey === teamKey || (teamKey.length >= 4 && aKey.includes(teamKey)) || (aKey.length >= 4 && teamKey.includes(aKey)))) {
            return `${league} - Virtual`;
        }
    }

    // 3. Fallback to raw league string if teams cannot be matched
    const l = String(rawLeague || '').toLowerCase();
    if (l.includes('england') || l.includes('epl') || l.includes('premier')) return 'England - Virtual';
    if (l.includes('spain') || l.includes('laliga') || l.includes('la liga')) return 'Spain - Virtual';
    if (l.includes('italy') || l.includes('serie')) return 'Italy - Virtual';
    if (l.includes('germany') || l.includes('bundesliga')) return 'Germany - Virtual';
    if (l.includes('france') || l.includes('ligue')) return 'France - Virtual';

    return 'England - Virtual'; // Default fallback
}

/**
 * Converts any league name variant to a clean DB league name.
 */
function toDbLeague(league) {
    if (!league) return 'England - Virtual';
    const cleanLeague = league.replace(/\s*\(Upcoming\)/i, '').trim();
    if (LEAGUE_MAP[cleanLeague]) return LEAGUE_MAP[cleanLeague];
    if (cleanLeague.includes(' League')) {
        return `${cleanLeague.replace(' League', '')} - Virtual`;
    }
    if (['England', 'Spain', 'Italy', 'Germany', 'France'].includes(cleanLeague)) {
        return `${cleanLeague} - Virtual`;
    }
    return cleanLeague;
}

module.exports = {
    LEAGUE_MAP,
    LEAGUE_TAB_TEXT,
    SUPPORTED_LEAGUES,
    TEAM_LEAGUES,
    detectLeague,
    toDbLeague,
    normalizeTeamKey
};
