// Janmarg (Ahmedabad BRTS), transcribed from the Janmarg route map: stop order, corridors,
// planned extensions (dashed) and interchange stops. x/y are positions on that map (px), used to
// draw it as a schematic. Metro ⇄ BRTS walking links are listed in METRO_LINKS.
import { MODEL } from './data'
import type { Plan } from './engine'
import { STATIONS, serviceOrder } from './network'

export interface BrtsStop {
  id: string
  name: string
  x: number
  y: number
  interchange?: boolean
}

const S = (name: string, x: number, y: number, interchange = false): BrtsStop => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  name,
  x,
  y,
  ...(interchange ? { interchange } : {}),
})

export const BRTS_STOPS: BrtsStop[] = [
  // north: Chandkheda / Motera / Sabarmati
  S('DCIS Circle (Zundal)', 367, 33), S('Sarthi Bunglows', 388, 55), S('GD Cabin', 409, 78), S('Chandkheda Gam', 433, 102),
  S('Shiv Shakti Nagar', 450, 125), S('Janatanagar', 471, 148), S('Avani Bhavan ONGC', 493, 170), S('Visat Junction', 517, 194),
  S('Vishwakarma College', 555, 139), S('Motera Cross Road', 517, 220), S('Sabarmati Police Station', 517, 245),
  S('Sabarmati Municipal Swimming Pool', 517, 270), S('Rathi Apartment', 517, 295), S('Sabarmati Powerhouse', 517, 320),
  S('RTO Circle', 521, 383, true), S('Ranip Cross Road', 489, 383), S('Bhavsar Hostel', 422, 383, true), S('Akhbarnagar', 374, 383),
  S('NR Patel Park', 453, 405), S('Ramapir No Tekro', 453, 430), S('Juna Vadaj', 453, 455), S('Gurudwara', 638, 455),
  S('Hanumanpura', 690, 455), S('Sarkari Litho Press (Delhi Darwaja)', 690, 490, true),
  // west: 132 ft ring road, Sola, SG road side
  S('Pragatinagar', 374, 415), S('Shastrinagar', 374, 452), S('Jaimangal', 374, 482), S('Sola Cross Road', 374, 513, true),
  S('Shree Valinath Chowk', 374, 555), S('Memnagar', 374, 590), S('University', 374, 620), S('Andhjan Mandal', 374, 646),
  S('Himmatlal Park', 374, 676), S('Paranagar', 264, 513), S('Parshvanath Jain Mandir', 226, 513), S('Bhuyangdev', 192, 513),
  S('Sattadhar Char Rasta', 159, 513), S('Sola Bridge', 126, 513), S('Science City Approach', 88, 513),
  S('Sola Civil Hospital', 126, 470), S('Sola Bhagvat Vidyapith', 126, 425),
  S('Ghuma Gam', 11, 700), S('Sarkari Tubewell', 40, 700), S('Bopal Approach', 72, 700), S('Ambali Gam', 103, 700),
  S('Swagat Bunglows', 131, 700), S('Jayantilal Park', 159, 700), S('Ashok Vatika', 186, 700), S('Antariksh Colony', 211, 700),
  S('ISKCON Temple', 236, 700), S('ISKCON Cross Road', 261, 700), S('Ramdev Nagar', 287, 700), S('ISRO', 311, 700),
  S('Star Bazaar', 335, 700), S('Jodhpur Char Rasta', 357, 700), S('Shivranjani', 392, 700, true), S('Jhansi Ki Rani', 418, 700),
  S('Nehrunagar', 445, 700, true), S('Manekbaug', 462, 720), S('L Colony', 462, 677), S('Panjarapol', 462, 650),
  S('Gulbai Tekra Approach', 462, 610, true), S('LD Engineering College', 462, 570), S('Commerce Six Road', 517, 570),
  S('Dharnidhar Derasar', 513, 748), S('Anjali', 540, 750, true), S('Vasna', 540, 825), S('Chandranagar', 566, 750),
  // centre / old city
  S('Townhall', 535, 640, true), S('Lokmanya Tilak Bag', 639, 646), S('Raikhad Char Rasta', 662, 646), S('AMC Office', 688, 646),
  S('Astodia Chakla', 713, 646), S('Astodia Darwaja', 738, 646), S('Raipur Darwaja', 765, 646), S('Karnamukteshwar Mahadev', 788, 646),
  S('Sarangpur Darwaja', 826, 628, true), S('Soma Textiles', 872, 630), S('Ajit Mill', 903, 630),
  S('Geeta Mandir ST', 751, 670), S('Bhulabhai Park', 751, 693), S('Mangal Park', 751, 717),
  // south: Kankaria, Maninagar, Narol
  S('Khodiyarnagar', 639, 750), S('Danilimda Char Rasta', 659, 750), S('Vaikunthdham', 698, 750), S('Swaminarayan College', 728, 750),
  S('Kankaria Telephone Exchange', 773, 750), S('Kankaria Lake', 855, 750), S('Rambaug', 855, 775), S('Maninagar Cross Road', 855, 800),
  S('Maninagar Railway Station', 855, 825, true), S('Swaminarayan Mandir', 818, 825), S('Jawahar Chowk', 789, 822),
  S('Bhairavnath Road', 789, 795), S('Mira Cinema', 789, 765),
  S('Danilimda Road', 676, 775), S('Chhipa Society', 676, 798), S('Chandola Lake', 676, 820), S('BRTS Workshop', 676, 845),
  S('Kashiram Textile', 676, 868), S('Narol', 676, 893), S('Mukesh Industries', 750, 893), S('Isanpur', 826, 893), S('Ghodasar', 903, 893),
  // east: Naroda, Bapunagar, Odhav, CTM
  S('Kalupur Railway Station', 822, 512, true), S('G.C.S. Hospital', 857, 425), S('Arvind Mill', 857, 400), S('Jinning Press', 857, 375),
  S('Ashok Mill', 857, 350), S('Naroda Fruit Market', 857, 325), S('Memco Cross Road', 857, 292, true),
  S('Municipal North Zone Office', 887, 292), S('G. D. High School', 917, 292), S('Saijpur Tower', 947, 292),
  S('Naroda ST Workshop', 972, 292), S('Bethak', 993, 265), S('Naroda Gam', 1019, 240, true),
  S('Dhanushdhari Mandir', 972, 317), S('Krishnanagar', 972, 342), S('Vijay Park', 972, 365), S('Hirawadi', 972, 387),
  S('Thakkarbapanagar Approach', 972, 412), S('Leelanagar', 972, 437), S('Bapunagar Approach', 972, 462), S('Viratnagar', 972, 487),
  S('Soni Ni Chali', 975, 628, true), S('Grid Station', 1002, 628), S('Odhav Fire Station', 1028, 628), S('Vallabhnagar', 1054, 628),
  S('Chhotalal Ni Chali', 1080, 628), S('Muralidhar Society', 1107, 628), S('Odhav Talav (Gam)', 1132, 628),
  S('S. P. Ring Road Approach', 1158, 628), S('Geeta Gauri Cinema', 972, 657), S('Rameshwar Park', 972, 682),
  S('Ramrajya Nagar', 972, 707), S('Rabari Colony', 972, 732), S('Jogeshwari Society', 972, 760), S('Purvadeep Society', 972, 787),
  S('Hatkeshwar', 972, 815), S('CTM Cross Road', 972, 845), S('Express Highway Junction', 972, 872), S('Jashodanagar', 972, 893),
]

export const BRTS = Object.fromEntries(BRTS_STOPS.map((s) => [s.id, s])) as Record<string, BrtsStop>
const id = (name: string) => {
  const s = BRTS_STOPS.find((x) => x.name === name)
  if (!s) throw new Error(`unknown BRTS stop ${name}`)
  return s.id
}

/** Corridors as drawn on the map; `ext` = planned extension (dashed). */
export const BRTS_PATHS: { stops: string[]; ext?: boolean }[] = [
  { stops: ['DCIS Circle (Zundal)', 'Sarthi Bunglows', 'GD Cabin'], ext: true },
  {
    stops: [
      'GD Cabin', 'Chandkheda Gam', 'Shiv Shakti Nagar', 'Janatanagar', 'Avani Bhavan ONGC', 'Visat Junction', 'Motera Cross Road',
      'Sabarmati Police Station', 'Sabarmati Municipal Swimming Pool', 'Rathi Apartment', 'Sabarmati Powerhouse', 'RTO Circle',
      'Ranip Cross Road', 'Bhavsar Hostel', 'Akhbarnagar', 'Pragatinagar', 'Shastrinagar', 'Jaimangal', 'Sola Cross Road',
      'Shree Valinath Chowk', 'Memnagar', 'University', 'Andhjan Mandal', 'Himmatlal Park', 'Shivranjani', 'Jhansi Ki Rani',
      'Nehrunagar', 'Manekbaug', 'Dharnidhar Derasar', 'Anjali', 'Chandranagar', 'Khodiyarnagar', 'Danilimda Char Rasta',
      'Vaikunthdham', 'Swaminarayan College', 'Kankaria Telephone Exchange', 'Kankaria Lake', 'Rambaug', 'Maninagar Cross Road',
      'Maninagar Railway Station',
    ],
  },
  { stops: ['Visat Junction', 'Vishwakarma College'], ext: true },
  { stops: ['Ranip Cross Road', 'NR Patel Park', 'Ramapir No Tekro', 'Juna Vadaj', 'Gurudwara', 'Hanumanpura', 'Sarkari Litho Press (Delhi Darwaja)'] },
  { stops: ['Sarkari Litho Press (Delhi Darwaja)', 'Kalupur Railway Station', 'Sarangpur Darwaja'], ext: true },
  {
    stops: [
      'Kalupur Railway Station', 'G.C.S. Hospital', 'Arvind Mill', 'Jinning Press', 'Ashok Mill', 'Naroda Fruit Market', 'Memco Cross Road',
      'Municipal North Zone Office', 'G. D. High School', 'Saijpur Tower', 'Naroda ST Workshop', 'Bethak', 'Naroda Gam',
    ],
  },
  {
    stops: [
      'Naroda ST Workshop', 'Dhanushdhari Mandir', 'Krishnanagar', 'Vijay Park', 'Hirawadi', 'Thakkarbapanagar Approach', 'Leelanagar',
      'Bapunagar Approach', 'Viratnagar', 'Soni Ni Chali', 'Geeta Gauri Cinema', 'Rameshwar Park', 'Ramrajya Nagar', 'Rabari Colony',
      'Jogeshwari Society', 'Purvadeep Society', 'Hatkeshwar', 'CTM Cross Road', 'Express Highway Junction', 'Jashodanagar', 'Ghodasar',
      'Isanpur', 'Mukesh Industries', 'Narol', 'Kashiram Textile', 'BRTS Workshop', 'Chandola Lake', 'Chhipa Society', 'Danilimda Road',
      'Danilimda Char Rasta',
    ],
  },
  { stops: ['Soni Ni Chali', 'Grid Station', 'Odhav Fire Station', 'Vallabhnagar', 'Chhotalal Ni Chali', 'Muralidhar Society', 'Odhav Talav (Gam)', 'S. P. Ring Road Approach'] },
  { stops: ['Ajit Mill', 'Soni Ni Chali'] },
  { stops: ['Sarangpur Darwaja', 'Soma Textiles', 'Ajit Mill'], ext: true },
  {
    stops: [
      'Gulbai Tekra Approach', 'Townhall', 'Lokmanya Tilak Bag', 'Raikhad Char Rasta', 'AMC Office', 'Astodia Chakla', 'Astodia Darwaja',
      'Raipur Darwaja', 'Karnamukteshwar Mahadev',
    ],
  },
  { stops: ['Karnamukteshwar Mahadev', 'Sarangpur Darwaja'], ext: true },
  { stops: ['LD Engineering College', 'Gulbai Tekra Approach', 'Panjarapol', 'L Colony', 'Nehrunagar'] },
  { stops: ['LD Engineering College', 'Commerce Six Road'], ext: true },
  { stops: ['Kankaria Telephone Exchange', 'Mira Cinema', 'Bhairavnath Road', 'Jawahar Chowk', 'Swaminarayan Mandir', 'Maninagar Railway Station'] },
  { stops: ['Astodia Darwaja', 'Geeta Mandir ST', 'Bhulabhai Park', 'Mangal Park', 'Swaminarayan College'], ext: true },
  { stops: ['Anjali', 'Vasna'], ext: true },
  { stops: ['Ghuma Gam', 'Sarkari Tubewell', 'Bopal Approach'], ext: true },
  {
    stops: [
      'Bopal Approach', 'Ambali Gam', 'Swagat Bunglows', 'Jayantilal Park', 'Ashok Vatika', 'Antariksh Colony', 'ISKCON Temple',
      'ISKCON Cross Road', 'Ramdev Nagar', 'ISRO', 'Star Bazaar', 'Jodhpur Char Rasta', 'Shivranjani',
    ],
  },
  { stops: ['Sola Cross Road', 'Paranagar', 'Parshvanath Jain Mandir', 'Bhuyangdev', 'Sattadhar Char Rasta', 'Sola Bridge'] },
  { stops: ['Sola Bridge', 'Science City Approach'], ext: true },
  { stops: ['Sola Bridge', 'Sola Civil Hospital', 'Sola Bhagvat Vidyapith'], ext: true },
].map((p) => ({ ...p, stops: p.stops.map(id) }))

/**
 * Metro station ⇄ nearby Janmarg stop (walk). 'same name' = the BRTS stop carries the metro station's
 * name or landmark; 'assumed' = nearby by our reading of the city map, to be checked.
 */
export const METRO_LINKS: { metro: string; brts: string; source: 'same name' | 'assumed' }[] = [
  { metro: 'motera-stadium', brts: id('Motera Cross Road'), source: 'same name' },
  { metro: 'vishwakarma-college', brts: id('Vishwakarma College'), source: 'same name' },
  { metro: 'aec', brts: id('Sabarmati Powerhouse'), source: 'same name' }, // AEC = the Sabarmati power house
  { metro: 'sabarmati', brts: id('Sabarmati Police Station'), source: 'assumed' },
  { metro: 'ranip', brts: id('Ranip Cross Road'), source: 'same name' },
  { metro: 'vadaj', brts: id('Juna Vadaj'), source: 'same name' },
  { metro: 'commerce-six-road', brts: id('Commerce Six Road'), source: 'same name' },
  { metro: 'gujarat-university', brts: id('University'), source: 'assumed' },
  { metro: 'gurukul-road', brts: id('Memnagar'), source: 'assumed' },
  { metro: 'gandhigram', brts: id('Townhall'), source: 'assumed' },
  { metro: 'apmc', brts: id('Vasna'), source: 'assumed' },
  { metro: 'shahpur', brts: id('Sarkari Litho Press (Delhi Darwaja)'), source: 'assumed' },
  { metro: 'kalupur', brts: id('Kalupur Railway Station'), source: 'same name' },
  { metro: 'kankaria-east', brts: id('Kankaria Lake'), source: 'assumed' },
  { metro: 'rabari-colony', brts: id('Rabari Colony'), source: 'same name' },
]

export const brtsFor = (metroId: string) => METRO_LINKS.filter((l) => l.metro === metroId)

// ---- graph and routing (stops, unweighted; planned extensions do not run yet, so relief never uses them) ----
const ADJ: Record<string, string[]> = {}
for (const p of BRTS_PATHS.filter((x) => !x.ext))
  for (let i = 0; i + 1 < p.stops.length; i++) {
    const [a, b] = [p.stops[i], p.stops[i + 1]]
    ;(ADJ[a] ??= []).push(b)
    ;(ADJ[b] ??= []).push(a)
  }

export function brtsRoute(from: string, to: string): string[] | null {
  const prev: Record<string, string | null> = { [from]: null }
  const queue = [from]
  while (queue.length) {
    const u = queue.shift()!
    if (u === to) break
    for (const v of ADJ[u] ?? [])
      if (!(v in prev)) {
        prev[v] = u
        queue.push(v)
      }
  }
  if (!(to in prev)) return null
  const path: string[] = []
  for (let v: string | null = to; v; v = prev[v]) path.unshift(v)
  return path
}

// ---- surge relief: hand metro overflow to Janmarg ----
export const BUS_CAPACITY = 80 // Janmarg 12 m bus, standing load (assumption)
export const MAX_EXTRA_BUSES = 30 // extra buses per hour one corridor can take (assumption)
export const BUS_KMPH = 22 // Janmarg average with stops (assumption)

export interface Relief {
  service: Plan['service']
  from: number // hour
  to: number
  metroFrom: string // metro station ids
  metroTo: string
  route: string[] // BRTS stop ids
  overflow: number // passengers/hour the metro cannot carry
  buses: number // extra buses per hour
  carried: number // passengers/hour those buses can take
  why: string
}

/**
 * Where the metro cannot carry demand even at the shortest headway, run extra Janmarg buses between BRTS
 * stops next to stations on either side of the overloaded link. Origin: the linked station before the link
 * where most riders board. Destination: linked stations after it, ranked by riders getting off × distance
 * (buses take the long trips off the trains). If one corridor's buses are not enough, a second takes the rest.
 */
export function reliefPlan(plan: Plan, flows: (h: number) => { boardings: Record<string, number>; alightings: Record<string, number> }): Relief[] {
  const out: Relief[] = []
  for (const r of plan.hours) {
    if (r.overflow <= 0) continue
    const order = serviceOrder(plan.service, r.link.from, r.link.to)
    const i = order.indexOf(r.link.from)
    const j = order.indexOf(r.link.to)
    if (i < 0 || j < 0) continue
    const dir = Math.sign(j - i)
    const linked = (s: string) => brtsFor(s).length > 0
    const upstream = order.filter((_, k) => (dir > 0 ? k <= i : k >= i)).filter(linked)
    const downstream = order.filter((_, k) => (dir > 0 ? k >= j : k <= j)).filter(linked)
    if (!upstream.length || !downstream.length) continue
    const f = flows(r.hour)
    const origin = upstream.reduce((a, b) => ((f.boardings[b] ?? 0) > (f.boardings[a] ?? 0) ? b : a))
    const targets = downstream
      .map((t) => ({ t, score: (f.alightings[t] ?? 0) * Math.abs(order.indexOf(t) - order.indexOf(origin)) }))
      .sort((a, b) => b.score - a.score)
    // event reasons first; generator labels carry "(arrive", "(leave" or "(all day"
    const why =
      r.drivers.find((d) => d.includes(':') && !/\((arrive|leave|all day)/.test(d)) ?? r.drivers[0] ?? `metro full at ${MODEL.minHeadway}-minute trains`
    let remaining = r.overflow
    let corridors = 0
    for (const { t } of targets) {
      if (remaining <= 0 || corridors === 2) break
      const route = brtsRoute(brtsFor(origin)[0].brts, brtsFor(t)[0].brts)
      if (!route || route.length < 3) continue // a one-stop hop is not worth a bus corridor
      corridors++
      const buses = Math.min(MAX_EXTRA_BUSES, Math.ceil(remaining / BUS_CAPACITY))
      const share = Math.min(remaining, buses * BUS_CAPACITY)
      remaining -= share
      const prev = out.find((x) => x.to === r.hour && x.metroFrom === origin && x.metroTo === t)
      if (prev) {
        prev.to = r.hour + 1
        prev.overflow = Math.max(prev.overflow, r.overflow)
        prev.buses = Math.max(prev.buses, buses)
        prev.carried = Math.max(prev.carried, share)
        continue
      }
      out.push({ service: plan.service, from: r.hour, to: r.hour + 1, metroFrom: origin, metroTo: t, route, overflow: r.overflow, buses, carried: share, why })
    }
  }
  return out
}

export const metroName = (id: string) => STATIONS[id]?.name ?? id
