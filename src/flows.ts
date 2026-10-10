// Station boardings and link loads per hour, per service.
// Boardings at s = service hourly journeys × weight(s)/Σweights.
// Destinations by gravity: P(s→t) ∝ weight(t) × exp(−0.08 × |km(s)−km(t)|).
// Link load = Σ trips crossing that link, per direction (fwd = in line order).
import { MODEL } from './data'
import { dayModel, festivalJourneys, type DayContext } from './engine'
import { LINE, SERVICES, STATIONS, kindOf, weightOf, type ServiceId } from './network'

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
  for (const s of nodes) {
    const v = new Float64Array(edges.length * 2)
    const pull = nodes.map((t) => (t === s ? 0 : weightOf(t) * Math.exp(-DECAY * dist[s][t])))
    const sum = pull.reduce((a, b) => a + b, 0)
    nodes.forEach((t, i) => {
      if (pull[i]) for (const slot of path[s][t]) v[slot] += pull[i] / sum
    })
    unit[s] = v
  }
  return { nodes, edges, path, dist, unit }
}

export const GRAPHS: Record<ServiceId, Graph> = { blue: buildGraph('blue'), redYellow: buildGraph('redYellow') }

export interface ServiceHour {
  service: ServiceId
  hour: number
  journeys: number
  boardings: Record<string, number>
  /** per edge index: [fwd, rev] passengers/hour */
  links: [number, number][]
  busiest: { edge: Edge; dir: 'fwd' | 'rev'; load: number }
  /** station-specific reasons (events), plus line-wide reasons */
  stationDrivers: Record<string, string[]>
  drivers: string[]
  crush: boolean
}

export function serviceHour(ctx: DayContext, sid: ServiceId, h: number): ServiceHour {
  const g = GRAPHS[sid]
  const m = dayModel(ctx)
  const svc = SERVICES[sid]
  const open = g.nodes.filter((s) => weightOf(s) > 0)
  const W = open.reduce((a, s) => a + weightOf(s), 0)
  const boardings: Record<string, number> = Object.fromEntries(g.nodes.map((s) => [s, 0]))
  const slots = new Float64Array(g.edges.length * 2)
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
  }
  const trip = (o: string, t: string, n: number) => {
    boardings[o] += n
    for (const slot of g.path[o][t]) slots[slot] += n
  }

  // base demand
  const journeys = m.networkDaily * svc.share * m.share(h)
  for (const s of open) gravity(s, (journeys * weightOf(s)) / W)
  if (m.workingDay && ((h >= 8 && h < 11) || (h >= 17 && h < 20))) drivers.push('office and college peak')
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
      const fans = e.attendance * MODEL.stadiumMetroShare
      const startH = Math.floor(e.start)
      const endH = Math.floor(e.end)
      const inflow: Record<number, number> = { [startH - 4]: 0.15, [startH - 3]: 0.25, [startH - 2]: 0.35, [startH - 1]: 0.25 }
      const egress: Record<number, number> = { [endH]: 0.6, [endH + 1]: 0.3, [endH + 2]: 0.1 }
      const frac = inflow[h] ?? egress[h]
      if (!frac) continue
      const arriving = inflow[h] != null
      const n = fans * frac
      const blueShare = SERVICES.blue.share
      // Blue riders travel to Old High Court and change to Red; Red+Yellow riders ride straight to Motera.
      const legs: [string, string, number][] =
        sid === 'blue'
          ? open.map((s) => [s, OHC, (n * blueShare * weightOf(s)) / W] as [string, string, number])
          : [
              [OHC, MOTERA, n * blueShare],
              ...open.map((s) => [s, MOTERA, (n * (1 - blueShare) * weightOf(s)) / W] as [string, string, number]),
            ]
      for (const [o, t, k] of legs) {
        if (o === t) continue
        if (arriving) trip(o, t, k)
        else trip(t, o, k)
      }
      const label = `${e.name}: ${arriving ? 'fans arriving at Motera' : 'crowd leaving Motera'}`
      drivers.push(label)
      why(sid === 'blue' ? OHC : MOTERA, label)
      if (sid === 'redYellow') why(OHC, `${e.name}: Blue riders changing at Old High Court`)
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

  const links = g.edges.map((_, i) => [slots[i * 2], slots[i * 2 + 1]] as [number, number])
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
    links,
    busiest: best,
    stationDrivers,
    drivers: [...new Set(drivers)],
    crush,
  }
}

export const stationName = (id: string) => STATIONS[id]?.name ?? id
