// Station boardings and link loads per hour, per service.
// Boardings at s = service hourly journeys × weight(s)/Σweights.
// Destinations by gravity: P(s→t) ∝ weight(t) × exp(−0.08 × |km(s)−km(t)|).
// Link load = Σ trips crossing that link, per direction (fwd = in line order).
// Demand = generator trips (generators.ts: WHEN and WHERE) + background on the flat holiday curve.
// Calibration: generators are scaled once so they carry GENERATOR_SHARE of a normal weekday's trips;
// background fills the rest of each day's line demand (network × day factor × line share).
import { MODEL } from './data'
import { buildContext, dayModel, festivalJourneys, holidayShare, type DayContext } from './engine'
import { GENERATORS, activity, generatorHour, windowLabel, type Generator } from './generators'
import { LINE, SERVICES, STATIONS, kindOf, slug, weightOf, type ServiceId } from './network'

const DECAY = 0.08
export const OHC = 'old-high-court'
export const MOTERA = 'motera-stadium'

export interface Edge {
  id: string // `${line}:${a}>${b}`
  line: string
  a: string
  b: string
  km: number
}

interface Graph {
  nodes: string[]
  edges: Edge[]
  /** path[s][t] = list of edge-direction slots (edgeIndex*2 + 0 fwd / 1 rev) */
  path: Record<string, Record<string, number[]>>
  dist: Record<string, Record<string, number>>
  /** unit link load per boarding at s, gravity destinations */
  unit: Record<string, Float64Array>
  /** gravity destination shares from s, indexed like nodes */
  dest: Record<string, Float64Array>
}

function buildGraph(sid: ServiceId): Graph {
  const edges: Edge[] = []
  const nodes: string[] = []
  const adj: Record<string, { to: string; slot: number; km: number }[]> = {}
  for (const lid of SERVICES[sid].lines) {
    const st = LINE[lid].stations
    for (const s of st)
      if (!adj[s.id]) {
        adj[s.id] = []
        nodes.push(s.id)
      }
    for (let i = 0; i + 1 < st.length; i++) {
      const [a, b] = [st[i], st[i + 1]]
      const k = edges.length
      edges.push({ id: `${lid}:${a.id}>${b.id}`, line: lid, a: a.id, b: b.id, km: b.km - a.km })
      adj[a.id].push({ to: b.id, slot: k * 2, km: b.km - a.km })
      adj[b.id].push({ to: a.id, slot: k * 2 + 1, km: b.km - a.km })
    }
  }
  const path: Graph['path'] = {}
  const dist: Graph['dist'] = {}
  for (const s of nodes) {
    path[s] = { [s]: [] }
    dist[s] = { [s]: 0 }
    const queue = [s]
    while (queue.length) {
      const u = queue.shift()!
      for (const e of adj[u])
        if (path[s][e.to] == null) {
          path[s][e.to] = [...path[s][u], e.slot]
          dist[s][e.to] = dist[s][u] + e.km
          queue.push(e.to)
        }
    }
  }
  const unit: Graph['unit'] = {}
  const dest: Graph['dest'] = {}
  for (const s of nodes) {
    const v = new Float64Array(edges.length * 2)
    const pull = nodes.map((t) => (t === s ? 0 : weightOf(t) * Math.exp(-DECAY * dist[s][t])))
    const sum = pull.reduce((a, b) => a + b, 0)
    nodes.forEach((t, i) => {
      if (pull[i]) for (const slot of path[s][t]) v[slot] += pull[i] / sum
    })
    unit[s] = v
    dest[s] = Float64Array.from(pull, (p) => p / sum)
  }
  return { nodes, edges, path, dist, unit, dest }
}

export const GRAPHS: Record<ServiceId, Graph> = { blue: buildGraph('blue'), redYellow: buildGraph('redYellow') }

export interface GenTrip {
  g: Generator
  station: string // station id
  inbound: number // trips/hour to the station, calibrated
  outbound: number
}
export interface DemandHour {
  background: number
  gens: GenTrip[]
  journeys: number
  /** the generators that shape this hour, named for justifications */
  drivers: string[]
}

/** Share of a generator's trips that ride this service (interchange stations are split by line share). */
function serviceSplit(g: Generator, sid: ServiceId): number {
  const lines = STATIONS[slug(g.station)]?.lines ?? []
  const sids = new Set(lines.map((l) => (l === 'blue' ? 'blue' : 'redYellow')))
  if (!sids.has(sid)) return 0
  return sids.size > 1 ? SERVICES[sid].share : 1
}

const HOURS = Array.from({ length: 28 }, (_, h) => h)
const rawGenerators = (ctx: DayContext, sid: ServiceId) =>
  GENERATORS.map((g) => ({ g, k: serviceSplit(g, sid) * activity(g, ctx) }))
    .filter((x) => x.k > 0)
    .map(({ g, k }) => ({ g, hours: HOURS.map((h) => generatorHour(g, h, k)) }))

let calibration: Record<ServiceId, number> | null = null
/** Trips per generator person-trip, fixed from a normal weekday (Mon 26 Oct 2026). Lazy: engine ↔ flows import cycle. */
function calibrate(): Record<ServiceId, number> {
  if (calibration) return calibration
  const ref = buildContext('2026-10-26', [], null)
  const out = {} as Record<ServiceId, number>
  for (const sid of Object.keys(SERVICES) as ServiceId[]) {
    const raw = rawGenerators(ref, sid).reduce((a, x) => a + x.hours.reduce((b, t) => b + t.inbound + t.outbound, 0), 0)
    out[sid] = (MODEL.generatorShare * MODEL.networkDailyJourneys * SERVICES[sid].share) / raw
  }
  return (calibration = out)
}

const demandCache = new WeakMap<DayContext, Partial<Record<ServiceId, DemandHour[]>>>()
/** Base demand (no events) for every hour of the day on one service. */
export function lineDemand(ctx: DayContext, sid: ServiceId): DemandHour[] {
  const cached = demandCache.get(ctx)?.[sid]
  if (cached) return cached
  const k = calibrate()[sid]
  const gens = rawGenerators(ctx, sid)
  const genDay = k * gens.reduce((a, x) => a + x.hours.reduce((b, t) => b + t.inbound + t.outbound, 0), 0)
  const lineDay = dayModel(ctx).networkDaily * SERVICES[sid].share
  const bgDay = Math.max(0, lineDay - genDay)
  const out = HOURS.map((h) => {
    const trips: GenTrip[] = gens
      .map(({ g, hours }) => ({ g, station: slug(g.station), inbound: k * hours[h].inbound, outbound: k * hours[h].outbound }))
      .filter((t) => t.inbound + t.outbound >= 1)
    const background = bgDay * holidayShare(h)
    const genTotal = trips.reduce((a, t) => a + t.inbound + t.outbound, 0)
    const journeys = background + genTotal
    // name the generators that dominate this hour: ≥15% of generator trips and ≥5% of all trips, top 2
    const ranked = trips
      .flatMap((t) => [
        { t, dir: 'in' as const, n: t.inbound },
        { t, dir: 'out' as const, n: t.outbound },
      ])
      .filter((x) => x.n >= 0.15 * genTotal && x.n >= 0.05 * journeys)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2)
    const drivers = ranked.map(({ t, dir }) => generatorLabel(t.g, dir))
    return { background, gens: trips, journeys, drivers }
  })
  demandCache.set(ctx, { ...demandCache.get(ctx), [sid]: out })
  return out
}

export const generatorLabel = (g: Generator, dir: 'in' | 'out') =>
  `${g.name}: ${dir === 'in' ? g.inVerb : g.outVerb} (${g.type === 'hub' ? (g.note ?? 'all day') : `${dir === 'in' ? 'arrive' : 'leave'} ${windowLabel(dir === 'in' ? g.arrive : g.leave)}`})`

export interface ServiceHour {
  service: ServiceId
  hour: number
  journeys: number
  boardings: Record<string, number>
  alightings: Record<string, number>
  /** per edge index: [fwd, rev] passengers/hour */
  links: [number, number][]
  busiest: { edge: Edge; dir: 'fwd' | 'rev'; load: number }
  /** station-specific reasons (events), plus line-wide reasons */
  stationDrivers: Record<string, string[]>
  drivers: string[]
  crush: boolean
}

/**
 * One hour on one service. `baseLinkScale` scales ordinary (non-event) link loads only — the planner's
 * calibration; boardings are never scaled.
 */
export function serviceHour(ctx: DayContext, sid: ServiceId, h: number, baseLinkScale = 1): ServiceHour {
  const g = GRAPHS[sid]
  const m = dayModel(ctx)
  const svc = SERVICES[sid]
  const open = g.nodes.filter((s) => weightOf(s) > 0)
  const W = open.reduce((a, s) => a + weightOf(s), 0)
  const boardings: Record<string, number> = Object.fromEntries(g.nodes.map((s) => [s, 0]))
  const alightings: Record<string, number> = Object.fromEntries(g.nodes.map((s) => [s, 0]))
  const baseSlots = new Float64Array(g.edges.length * 2)
  const eventSlots = new Float64Array(g.edges.length * 2)
  let slots = baseSlots
  const stationDrivers: Record<string, string[]> = {}
  const drivers: string[] = []
  let crush = false
  const why = (s: string, d: string) => {
    const list = (stationDrivers[s] ??= [])
    if (!list.includes(d)) list.push(d)
  }

  const gravity = (o: string, n: number) => {
    boardings[o] += n
    const u = g.unit[o]
    for (let i = 0; i < slots.length; i++) slots[i] += n * u[i]
    const d = g.dest[o]
    g.nodes.forEach((t, i) => (alightings[t] += n * d[i]))
  }
  const trip = (o: string, t: string, n: number) => {
    boardings[o] += n
    alightings[t] += n
    for (const slot of g.path[o][t]) slots[slot] += n
  }

  // base demand: background by weight + generator trips between residential stations and the generator
  const base = lineDemand(ctx, sid)[h] ?? { background: 0, gens: [], journeys: 0, drivers: [] }
  const journeys = base.journeys
  for (const s of open) gravity(s, (base.background * weightOf(s)) / W)
  const homes = open.filter((s) => kindOf(s) === null)
  for (const t of base.gens) {
    for (const o of homes) {
      trip(o, t.station, t.inbound / homes.length)
      trip(t.station, o, t.outbound / homes.length)
    }
    const peakish = Math.max(t.inbound, t.outbound) >= 10
    if (peakish) why(t.station, generatorLabel(t.g, t.inbound >= t.outbound ? 'in' : 'out'))
  }
  drivers.push(...base.drivers)
  slots = eventSlots // everything below is event demand
  if (m.holiday) drivers.push(`${m.holiday.name} holiday: no commute peak`)
  if (m.lowTravel) drivers.push(`${m.lowTravel.name}: very low travel`)
  if (m.rainy && journeys > 0) drivers.push(`heavy rain forecast (${ctx.rainMm} mm)`)

  let extra = 0
  for (const e of ctx.events) {
    if (e.type === 'exam') {
      const inbound = h >= 7 && h < 9
      const outbound = h >= 13 && h < 15
      if (!inbound && !outbound) continue
      const n = e.attendance * 0.4 * 0.5 * svc.share
      const colleges = open.filter((s) => kindOf(s) === 'college')
      const Wc = colleges.reduce((a, s) => a + weightOf(s), 0)
      for (const c of colleges) {
        const nc = (n * weightOf(c)) / Wc
        for (const o of open)
          if (o !== c) {
            const k = (nc * weightOf(o)) / (W - weightOf(c))
            if (inbound) trip(o, c, k)
            else trip(c, o, k)
          }
        why(c, `${e.name}: students ${inbound ? 'arriving' : 'leaving'}`)
      }
      drivers.push(`${e.name}: students ${inbound ? 'travelling in' : 'returning'}`)
      extra += n
    }
    if (e.type === 'stadium') {
      // crowd event at a venue station (Motera by default); riders of the other line change at Old High Court
      const venue = e.station && STATIONS[e.station] ? e.station : MOTERA
      const venueName = STATIONS[venue].name
      const venueSid: ServiceId = STATIONS[venue].lines.includes('blue') ? 'blue' : 'redYellow'
      const fans = e.attendance * (e.metroShare ?? MODEL.stadiumMetroShare)
      const startH = Math.floor(e.start)
      const endH = Math.floor(e.end)
      const inflow: Record<number, number> = { [startH - 4]: 0.15, [startH - 3]: 0.25, [startH - 2]: 0.35, [startH - 1]: 0.25 }
      const egress: Record<number, number> = { [endH]: 0.6, [endH + 1]: 0.3, [endH + 2]: 0.1 }
      const frac = inflow[h] ?? egress[h]
      if (!frac) continue
      const arriving = inflow[h] != null
      const n = fans * frac
      const own = SERVICES[sid].share
      const other = 1 - own
      const legs: [string, string, number][] =
        sid === venueSid
          ? [[OHC, venue, n * other], ...open.map((s) => [s, venue, (n * own * weightOf(s)) / W] as [string, string, number])]
          : open.map((s) => [s, OHC, (n * own * weightOf(s)) / W] as [string, string, number])
      for (const [o, t, k] of legs) {
        if (o === t) continue
        if (arriving) trip(o, t, k)
        else trip(t, o, k)
      }
      const label =
        venue === MOTERA
          ? `${e.name}: ${arriving ? 'fans arriving at Motera' : 'crowd leaving Motera'}`
          : `${e.name}: ${arriving ? `crowd arriving at ${venueName}` : `crowd leaving ${venueName}`}`
      drivers.push(label)
      why(sid === venueSid ? venue : OHC, label)
      if (sid === venueSid && venue !== OHC) why(OHC, `${e.name}: ${sid === 'blue' ? 'Red+Yellow' : 'Blue'} riders changing at Old High Court`)
      crush = true
      extra += n
    }
  }

  if (m.festivalNight) {
    const fest = festivalJourneys(ctx, m.festivalNight.name) * (svc.share / MODEL.corridorShare)
    const out: Record<number, number> = { 19: 0.3, 20: 0.5, 21: 0.2 }
    const back: Record<number, number> = { 23: 0.35, 24: 0.45, 25: 0.2 }
    const frac = out[h] ?? back[h]
    if (frac) {
      const label = `${m.festivalNight.name}: ${out[h] ? 'people heading out' : 'late return wave'}`
      for (const s of open) {
        gravity(s, (fest * frac) / open.length)
        why(s, label)
      }
      drivers.push(label)
      extra += fest * frac
    }
  }

  const link = (k: number) => baseSlots[k] * baseLinkScale + eventSlots[k]
  const links = g.edges.map((_, i) => [link(i * 2), link(i * 2 + 1)] as [number, number])
  let best = { edge: g.edges[0], dir: 'fwd' as 'fwd' | 'rev', load: 0 }
  links.forEach(([f, r], i) => {
    if (f > best.load) best = { edge: g.edges[i], dir: 'fwd', load: f }
    if (r > best.load) best = { edge: g.edges[i], dir: 'rev', load: r }
  })
  return {
    service: sid,
    hour: h,
    journeys: journeys + extra,
    boardings,
    alightings,
    links,
    busiest: best,
    stationDrivers,
    drivers: [...new Set(drivers)],
    crush,
  }
}

export const stationName = (id: string) => STATIONS[id]?.name ?? id
