// Trip generators: offices, colleges, hubs, industry, temples, with their real or assumed timings.
// Generators decide WHEN and WHERE trips happen; calibration (flows.ts) decides HOW MANY.
// Sizes and metro shares are ASSUMPTIONS (editable). `source` marks whether the timing is verified.
import type { DayContext } from './engine'

export type GeneratorType = 'govt' | 'office' | 'it' | 'college' | 'hub' | 'industry' | 'temple'

export interface Generator {
  id: string
  station: string // network.ts station name
  type: GeneratorType
  name: string
  size: number // people
  metroShare: number
  arrive: [number, number] // hours, decimal
  leave: [number, number]
  days: 'mon-sat' | 'mon-fri' | 'all'
  termOnly?: boolean
  /** govt rule: 2nd and 4th Saturdays off */
  altSaturdaysOff?: boolean
  /** hubs: share of trips spread flat over the service day (rest in the arrive/leave peaks, both directions) */
  allDay?: number
  weekendFactor?: number
  /** short verb phrases for justifications */
  inVerb: string
  outVerb: string
  source: 'verified' | 'assumed'
  note?: string
}

const GOVT = {
  type: 'govt' as const,
  arrive: [10, 10.5] as [number, number],
  leave: [18 + 10 / 60, 18.75] as [number, number],
  days: 'mon-sat' as const,
  altSaturdaysOff: true,
  inVerb: 'staff arriving',
  outVerb: 'offices empty out',
  source: 'verified' as const,
  note: 'Gujarat govt hours 10:30–18:10',
}
const NAVRANGPURA = {
  type: 'office' as const,
  arrive: [9.5, 10.5] as [number, number],
  leave: [17.5, 19] as [number, number],
  days: 'mon-sat' as const,
  inVerb: 'staff arriving',
  outVerb: 'offices empty out',
  source: 'assumed' as const,
}

export const GENERATORS: Generator[] = [
  { id: 'sachivalaya', station: 'Sachivalaya', name: 'Sachivalaya + Swarnim Sankul govt offices', size: 15000, metroShare: 0.1, ...GOVT },
  { id: 'juna-sachivalaya', station: 'Juna Sachivalaya', name: 'Old Sachivalaya offices', size: 8000, metroShare: 0.1, ...GOVT },
  { id: 'sector-16', station: 'Sector-16', name: 'Sector-16 govt offices + courts', size: 5000, metroShare: 0.08, ...GOVT },
  {
    id: 'gift', station: 'GIFT City', type: 'office', name: 'GIFT City IFSC banks and finance firms', size: 30000, metroShare: 0.1,
    arrive: [8.75, 10], leave: [18, 20], days: 'mon-fri', inVerb: 'staff arriving', outVerb: 'offices empty out', source: 'assumed',
  },
  {
    id: 'infocity', station: 'Infocity', type: 'it', name: 'Infocity IT park', size: 15000, metroShare: 0.08,
    arrive: [9, 10.5], leave: [18, 20.5], days: 'mon-fri', inVerb: 'staff arriving', outVerb: 'offices empty out', source: 'assumed',
  },
  { id: 'ashram-road', station: 'Old High Court', name: 'Ashram Road offices, courts, banks', size: 20000, metroShare: 0.06, ...NAVRANGPURA, arrive: [9.75, 10.75] },
  { id: 'commerce-six-road', station: 'Commerce Six Road', name: 'Navrangpura offices + colleges', size: 12000, metroShare: 0.06, ...NAVRANGPURA },
  { id: 'sp-stadium', station: 'SP Stadium', name: 'Navrangpura offices (SP Stadium)', size: 6000, metroShare: 0.06, ...NAVRANGPURA },
  {
    id: 'gu', station: 'Gujarat University', type: 'college', name: 'Gujarat University campus + affiliated colleges', size: 20000, metroShare: 0.12,
    arrive: [7.5, 9.5], leave: [13, 17], days: 'mon-sat', termOnly: true, inVerb: 'students arriving', outVerb: 'students leaving', source: 'assumed',
  },
  {
    id: 'gurukul', station: 'Gurukul Road', type: 'college', name: 'Gurukul Road colleges and coaching classes', size: 6000, metroShare: 0.12,
    arrive: [7, 9], leave: [12, 19], days: 'mon-sat', termOnly: true, inVerb: 'students arriving', outVerb: 'students leaving', source: 'assumed',
  },
  {
    id: 'vgec', station: 'Vishwakarma College', type: 'college', name: 'Vishwakarma Govt Engineering College', size: 4000, metroShare: 0.15,
    arrive: [8, 9.25], leave: [15.5, 17.5], days: 'mon-sat', termOnly: true, inVerb: 'students arriving', outVerb: 'students leaving', source: 'assumed',
  },
  {
    id: 'gnlu', station: 'GNLU', type: 'college', name: 'Gujarat National Law University (mostly residential)', size: 1500, metroShare: 0.05,
    arrive: [8.5, 9.5], leave: [16, 17.5], days: 'mon-sat', termOnly: true, inVerb: 'students arriving', outVerb: 'students leaving', source: 'assumed',
  },
  {
    id: 'pdeu', station: 'PDEU', type: 'college', name: 'Pandit Deendayal Energy University', size: 6000, metroShare: 0.12,
    arrive: [8, 9.25], leave: [16, 17.5], days: 'mon-sat', termOnly: true, inVerb: 'students arriving', outVerb: 'students leaving', source: 'assumed',
  },
  {
    id: 'kalupur', station: 'Kalupur', type: 'hub', name: 'Ahmedabad railway station (Kalupur)', size: 40000, metroShare: 0.05,
    arrive: [6, 9], leave: [19, 23], allDay: 0.5, days: 'all', inVerb: 'train passengers (morning arrivals)', outVerb: 'train passengers (evening departures)', source: 'assumed',
    note: 'all day, peaks 06–09 and 19–23',
  },
  {
    id: 'aec', station: 'AEC', type: 'hub', name: 'Sabarmati rail + industry (AEC)', size: 8000, metroShare: 0.05,
    arrive: [7, 10], leave: [17, 20], days: 'all', inVerb: 'rail and industry trips', outVerb: 'rail and industry trips', source: 'assumed',
  },
  {
    id: 'mahatma-mandir', station: 'Mahatma Mandir', type: 'hub', name: 'Gandhinagar railway station + convention centre', size: 8000, metroShare: 0.05,
    arrive: [7, 10], leave: [17, 21], days: 'all', inVerb: 'rail and convention trips', outVerb: 'rail and convention trips', source: 'assumed',
  },
  {
    id: 'apparel-park', station: 'Apparel Park', type: 'industry', name: 'Apparel Park garment and industrial units (shifts)', size: 15000, metroShare: 0.05,
    arrive: [7.5, 9], leave: [17, 19], days: 'mon-sat', inVerb: 'shift workers arriving', outVerb: 'shift ends', source: 'assumed',
  },
  {
    id: 'gheekanta', station: 'Gheekanta', type: 'office', name: 'Gheekanta old-city markets', size: 5000, metroShare: 0.05,
    arrive: [10, 12], leave: [19, 21.5], days: 'mon-sat', inVerb: 'markets opening', outVerb: 'markets closing', source: 'assumed',
  },
  {
    id: 'shahpur', station: 'Shahpur', type: 'office', name: 'Shahpur old-city markets', size: 5000, metroShare: 0.05,
    arrive: [10, 12], leave: [19, 21.5], days: 'mon-sat', inVerb: 'markets opening', outVerb: 'markets closing', source: 'assumed',
  },
  {
    id: 'akshardham', station: 'Akshardham', type: 'temple', name: 'Akshardham temple', size: 2500, metroShare: 0.08,
    arrive: [10, 13], leave: [17, 20.5], days: 'all', weekendFactor: 2, inVerb: 'visitors arriving', outVerb: 'visitors leaving', source: 'assumed',
  },
  {
    id: 'koba', station: 'Koba Gam', type: 'temple', name: 'Koba Jain tirth', size: 2500, metroShare: 0.08,
    arrive: [10, 13], leave: [17, 20.5], days: 'all', weekendFactor: 2, inVerb: 'visitors arriving', outVerb: 'visitors leaving', source: 'assumed',
  },
]

/** Diwali vacation for colleges (assumption). */
export const DIWALI_VACATION: [string, string] = ['2026-11-04', '2026-11-22']

/** How many of this generator's people travel today: 0 = closed, 1 = normal, 2 = weekend temple crowds. */
export function activity(g: Generator, ctx: DayContext): number {
  const holiday = ctx.calendar.some((c) => c.kind === 'holiday')
  const lowTravel = ctx.calendar.some((c) => c.kind === 'low-travel')
  const workplace = g.type === 'govt' || g.type === 'office' || g.type === 'it' || g.type === 'college'
  if (workplace && (holiday || lowTravel)) return 0
  if (g.type === 'industry' && lowTravel) return 0
  if (g.termOnly && ctx.date >= DIWALI_VACATION[0] && ctx.date <= DIWALI_VACATION[1]) return 0
  if (ctx.weekday === 0 && g.days !== 'all') return 0
  if (ctx.weekday === 6) {
    if (g.days === 'mon-fri') return 0
    const nth = Math.ceil(Number(ctx.date.slice(8, 10)) / 7)
    if (g.altSaturdaysOff && (nth === 2 || nth === 4)) return 0
  }
  const weekend = ctx.weekday === 0 || ctx.weekday === 6
  return weekend ? (g.weekendFactor ?? 1) : 1
}

// share of a normal(mean, sd) falling in [h, h+1)
const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const cdf = (x: number, m: number, s: number) => 0.5 * (1 + erf((x - m) / (s * Math.SQRT2)))
/** Bell curve over a window: the window holds ±2 sd (at least 15 min sd for walking and waiting). */
export const bell = ([a, b]: [number, number], h: number) => {
  const m = (a + b) / 2
  const s = Math.max(0.5, (b - a) / 4)
  return cdf(h + 1, m, s) - cdf(h, m, s)
}
const flat = (h: number) => (h >= 6 && h < 23 ? 1 / 17 : 0)

/** Trips per hour for one generator before calibration, by direction (to the station / from it). */
export function generatorHour(g: Generator, h: number, act: number): { inbound: number; outbound: number } {
  const daily = g.size * g.metroShare * act
  if (!daily) return { inbound: 0, outbound: 0 }
  if (g.type === 'hub') {
    const all = g.allDay ?? 0
    const shape = all * flat(h) + (1 - all) * 0.5 * (bell(g.arrive, h) + bell(g.leave, h))
    return { inbound: daily * shape, outbound: daily * shape }
  }
  return { inbound: daily * bell(g.arrive, h), outbound: daily * bell(g.leave, h) }
}

const hhmm = (x: number) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`
export const windowLabel = (w: [number, number]) => `${hhmm(w[0])}–${hhmm(w[1])}`
export const timingLabel = (g: Generator) =>
  g.note && g.type === 'hub' ? g.note : `arrive ${windowLabel(g.arrive)}, leave ${windowLabel(g.leave)}`
export const daysLabel = (g: Generator) =>
  `${g.days === 'all' ? 'every day' : g.days === 'mon-fri' ? 'Mon–Fri' : g.altSaturdaysOff ? 'Mon–Sat (2nd/4th Sat off)' : 'Mon–Sat'}${g.termOnly ? ', term time' : ''}${g.weekendFactor ? `, weekends ×${g.weekendFactor}` : ''}`
