// Full Ahmedabad Metro network. Sources: GMRC website station list, on-train route map,
// GMRC timetable 18 May 2026. Station km is derived from timetable run times (see TIMING).

export type LineId = 'blue' | 'red' | 'yellow' | 'violet'
export type ServiceId = 'blue' | 'redYellow'

export interface StationRef {
  id: string
  name: string
  km: number // from the start of its own line
  min: number // run time from the start of its own line
  interchange?: boolean
  closed?: boolean
}

export interface Line {
  id: LineId
  name: string
  color: string
  lengthKm: number
  stations: StationRef[]
}

export const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const INTERCHANGE = new Set(['Old High Court', 'Motera Stadium', 'GNLU'])
const CLOSED = new Set(['Sabarmati Railway Station']) // work in progress: trains pass, nobody boards

interface LineDef {
  id: LineId
  name: string
  color: string
  lengthKm: number
  stations: string[]
  /** timing points: station name → minutes from line start (GMRC timetable). Others interpolated evenly. */
  timing: Record<string, number>
}

const DEFS: LineDef[] = [
  {
    id: 'blue',
    name: 'Blue (Line 1, East–West)',
    color: '#1e88e5',
    lengthKm: 21.2,
    stations: [
      'Thaltej Gam', 'Thaltej', 'Doordarshan Kendra', 'Gurukul Road', 'Gujarat University', 'Commerce Six Road',
      'SP Stadium', 'Old High Court', 'Shahpur', 'Gheekanta', 'Kalupur', 'Kankaria East', 'Apparel Park',
      'Amraiwadi', 'Rabari Colony', 'Vastral', 'Nirant Cross Road', 'Vastral Gam',
    ],
    // no published timetable: 21.2 km at 33 km/h ≈ 39 min end to end
    timing: { 'Thaltej Gam': 0, 'Vastral Gam': 39 },
  },
  {
    id: 'red',
    name: 'Red (Line 2, APMC–Motera)',
    color: '#e53935',
    lengthKm: 18.9,
    stations: [
      'APMC', 'Jivraj Park', 'Rajivnagar', 'Shreyas', 'Paldi', 'Gandhigram', 'Old High Court', 'Usmanpura',
      'Vijaynagar', 'Vadaj', 'Ranip', 'Sabarmati Railway Station', 'AEC', 'Sabarmati', 'Motera Stadium',
    ],
    timing: { APMC: 0, 'Old High Court': 14, 'Motera Stadium': 32 },
  },
  {
    id: 'yellow',
    name: 'Yellow (Motera–Mahatma Mandir)',
    color: '#fbc02d',
    lengthKm: 23,
    stations: [
      'Motera Stadium', 'Koteshwar Road', 'Vishwakarma College', 'Tapovan Circle', 'Narmada Canal', 'Koba Circle',
      'Juna Koba', 'Koba Gam', 'GNLU', 'Raysan', 'Randesan', 'Dholakuva Circle', 'Infocity', 'Sector-1',
      'Sector 10A', 'Sachivalaya', 'Akshardham', 'Juna Sachivalaya', 'Sector-16', 'Sector-24', 'Mahatma Mandir',
    ],
    timing: { 'Motera Stadium': 0, 'Koteshwar Road': 3, GNLU: 18, Infocity: 27, Sachivalaya: 35, 'Mahatma Mandir': 46 },
  },
  {
    id: 'violet',
    name: 'Violet (GNLU–GIFT City spur)',
    color: '#3949ab',
    lengthKm: 5.4,
    stations: ['GNLU', 'PDEU', 'GIFT City'],
    timing: { GNLU: 0, 'GIFT City': 6 },
  },
]

function buildLine(d: LineDef): Line {
  // minutes per station: linear interpolation by station index between timing points
  const fixed = d.stations.map((s, i) => [i, d.timing[s]] as const).filter(([, m]) => m != null) as [number, number][]
  const mins = d.stations.map((_, i) => {
    const hi = fixed.findIndex(([j]) => j >= i)
    const [j1, m1] = fixed[hi]
    if (j1 === i) return m1
    const [j0, m0] = fixed[hi - 1]
    return m0 + ((m1 - m0) * (i - j0)) / (j1 - j0)
  })
  const total = mins[mins.length - 1]
  return {
    id: d.id,
    name: d.name,
    color: d.color,
    lengthKm: d.lengthKm,
    stations: d.stations.map((name, i) => ({
      id: slug(name),
      name,
      min: Math.round(mins[i] * 10) / 10,
      km: Math.round(((mins[i] / total) * d.lengthKm) * 100) / 100,
      ...(INTERCHANGE.has(name) ? { interchange: true } : {}),
      ...(CLOSED.has(name) ? { closed: true } : {}),
    })),
  }
}

export const LINES: Line[] = DEFS.map(buildLine)
export const LINE = Object.fromEntries(LINES.map((l) => [l.id, l])) as Record<LineId, Line>

/** Planning services. Red + Yellow run as one service (APMC → Mahatma Mandir, or → GIFT City via GNLU). */
export const SERVICES: Record<ServiceId, { name: string; lines: LineId[]; share: number }> = {
  blue: { name: 'Blue line', lines: ['blue'], share: 0.7 },
  redYellow: { name: 'Red + Yellow', lines: ['red', 'yellow', 'violet'], share: 0.3 },
}

export const STATIONS: Record<string, { name: string; lines: LineId[]; interchange: boolean; closed: boolean }> = {}
for (const l of LINES)
  for (const s of l.stations) {
    const e = (STATIONS[s.id] ??= { name: s.name, lines: [], interchange: false, closed: false })
    e.lines.push(l.id)
    e.interchange ||= !!s.interchange
    e.closed ||= !!s.closed
  }

export type StationKind = 'office' | 'college' | 'hub' | 'market' | 'stadium'

/** Relative trip attraction (assumption, editable). Everything not listed weighs 1; closed stations 0. */
export const WEIGHTS: Record<string, { w: number; kind: StationKind }> = {
  Sachivalaya: { w: 3, kind: 'office' },
  'Juna Sachivalaya': { w: 2, kind: 'office' },
  'Sector-16': { w: 1.5, kind: 'office' },
  'GIFT City': { w: 3, kind: 'office' },
  Infocity: { w: 2, kind: 'office' },
  'Commerce Six Road': { w: 2, kind: 'office' },
  'SP Stadium': { w: 1.5, kind: 'office' },
  GNLU: { w: 1.5, kind: 'college' },
  PDEU: { w: 1.5, kind: 'college' },
  'Gujarat University': { w: 2.5, kind: 'college' },
  'Vishwakarma College': { w: 1.5, kind: 'college' },
  'Gurukul Road': { w: 1.5, kind: 'college' },
  Kalupur: { w: 3, kind: 'hub' },
  AEC: { w: 1.5, kind: 'hub' },
  'Mahatma Mandir': { w: 2, kind: 'hub' },
  'Old High Court': { w: 2, kind: 'hub' },
  Shahpur: { w: 1.5, kind: 'market' },
  Gheekanta: { w: 2, kind: 'market' },
  'Motera Stadium': { w: 1, kind: 'stadium' },
}

const KIND_LABEL: Record<StationKind, string> = {
  office: 'office area',
  college: 'college / university',
  hub: 'rail / bus hub',
  market: 'old city market',
  stadium: 'stadium (events add crowds)',
}

export const weightOf = (id: string) => (STATIONS[id]?.closed ? 0 : (WEIGHTS[STATIONS[id]?.name]?.w ?? 1))
export const kindOf = (id: string): StationKind | null => WEIGHTS[STATIONS[id]?.name]?.kind ?? null
export const kindLabel = (id: string) => {
  const k = kindOf(id)
  return k ? `${KIND_LABEL[k]} (weight ${weightOf(id)})` : null
}

/** Current Red+Yellow service: real APMC northbound departures (GMRC timetable, 18 May 2026). */
export const APMC_DEPARTURES = [
  '06:20', '06:45', '06:58', '07:23', '07:34', '07:47', '08:03', '08:17', '08:33', '08:59', '09:11', '09:19', '09:48',
  '10:12', '10:36', '10:59', '11:25', '11:49', '12:13', '12:37', '13:02', '13:27', '13:50', '14:15', '14:40', '15:04',
  '15:16', '15:28', '15:53', '16:03', '16:17', '16:40', '17:06', '17:16', '17:30', '17:54', '18:06', '18:18', '18:43',
  '19:08', '19:42', '20:45',
]

export const SOURCES = 'GMRC timetable 18 May 2026 · GMRC station list and on-train route map · GMRC ridership press data (2025–26)'
