// One-time fetch of station coordinates → src/stations-geo.json. Never runs in the app.
//   npx tsx scripts/fetch-stations.ts
// 1. GMRC's Google My Maps as KML (KMZ is unzipped).  2. Overpass API fallback.
// Names are matched to network.ts; unmatched names are printed so they can be filled by hand.
// Entries already in stations-geo.json that this run cannot match are kept (hand fixes survive).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { STATIONS } from '../src/network.ts'

const OUT = new URL('../src/stations-geo.json', import.meta.url)
const KML_URL = 'https://www.google.com/maps/d/kml?mid=1ebnAmbRUbMyI_quB06reRZWcyfcLF8M&forcekml=1'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const BBOX = '22.95,72.50,23.30,72.72'

interface Geo {
  name: string
  lat: number
  lng: number
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/\bmetro station\b|\bmetro\b|\bstation\b/g, ' ')
    .replace(/\bgaam\b/g, 'gam') // Gaam and Gam are the same word; not stripped (Thaltej ≠ Thaltej Gam)
    .replace(/\bsector[\s-]*/g, 'sector')
    .replace(/[^a-z0-9]/g, '')

// other spellings seen on maps → our name
const ALIASES: Record<string, string> = {
  sardarpatelstadium: 'SP Stadium',
  spstadium: 'SP Stadium',
  commercesixroads: 'Commerce Six Road',
  commerce6road: 'Commerce Six Road',
  narendramodistadium: 'Motera Stadium',
  motera: 'Motera Stadium',
  gujaratnationallawuniversity: 'GNLU',
  panditdeendayalenergyuniversity: 'PDEU',
  pdpu: 'PDEU',
  giftcity: 'GIFT City',
  ahmedabadrailway: 'Kalupur',
  kalupurrailway: 'Kalupur',
  sabarmatirailway: 'Sabarmati Railway Station',
  doordarshan: 'Doordarshan Kendra',
  ddkendra: 'Doordarshan Kendra',
  nirantcrossroads: 'Nirant Cross Road',
  nirantcrossroad: 'Nirant Cross Road',
  sector10: 'Sector 10A',
}

const ours = Object.values(STATIONS).map((s) => s.name)
const byKey = new Map(ours.map((n) => [norm(n), n]))
const match = (raw: string) => byKey.get(norm(raw)) ?? ALIASES[norm(raw)] ?? null

function unzipFirstKml(buf: Buffer): string {
  // minimal ZIP reader: walk local file headers, inflate the first *.kml entry
  let p = 0
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8)
    const size = buf.readUInt32LE(p + 18)
    const nameLen = buf.readUInt16LE(p + 26)
    const extraLen = buf.readUInt16LE(p + 28)
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString()
    const data = buf.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + size)
    if (name.endsWith('.kml')) return (method === 8 ? inflateRawSync(data) : data).toString('utf8')
    p += 30 + nameLen + extraLen + size
  }
  throw new Error('no .kml inside KMZ')
}

async function fromKml(): Promise<{ raw: string; lat: number; lng: number }[]> {
  const r = await fetch(KML_URL)
  if (!r.ok) throw new Error(`KML HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  const text = buf.subarray(0, 2).toString() === 'PK' ? unzipFirstKml(buf) : buf.toString('utf8')
  const out: { raw: string; lat: number; lng: number }[] = []
  for (const pm of text.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? []) {
    const name = pm.match(/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/)?.[1]
    const pt = pm.match(/<Point>[\s\S]*?<coordinates>\s*([-\d.]+),([-\d.]+)/)
    if (name && pt) out.push({ raw: name.trim(), lng: Number(pt[1]), lat: Number(pt[2]) })
  }
  return out
}

async function fromOverpass(): Promise<{ raw: string; lat: number; lng: number }[]> {
  const q = `[out:json][timeout:60];(
node["railway"="station"]["station"="subway"](${BBOX});
node["public_transport"="station"]["subway"="yes"](${BBOX});
node["railway"="station"]["network"~"Ahmedabad Metro|GMRC"](${BBOX});
);out body;`
  const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: q }) })
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`)
  const d = (await r.json()) as { elements: { lat: number; lon: number; tags?: Record<string, string> }[] }
  return d.elements.flatMap((e) =>
    [e.tags?.['name:en'], e.tags?.name].filter(Boolean).map((raw) => ({ raw: raw!, lat: e.lat, lng: e.lon })),
  )
}

const found = new Map<string, Geo>()
const unknown = new Set<string>()
for (const [label, src] of [
  ['GMRC My Maps KML', fromKml],
  ['Overpass API', fromOverpass],
] as const) {
  if (found.size === ours.length) break
  try {
    const rows = await src()
    let added = 0
    for (const r of rows) {
      const name = match(r.raw)
      if (!name) unknown.add(`${r.raw} (${label})`)
      else if (!found.has(name)) {
        found.set(name, { name, lat: +r.lat.toFixed(6), lng: +r.lng.toFixed(6) })
        added++
      }
    }
    console.log(`${label}: ${rows.length} placemarks, ${added} new matches`)
  } catch (e) {
    console.log(`${label} failed: ${(e as Error).message}`)
  }
}

const previous: Geo[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
for (const g of previous) if (!found.has(g.name) && ours.includes(g.name)) found.set(g.name, g)

const missing = ours.filter((n) => !found.has(n))
const rows = ours.filter((n) => found.has(n)).map((n) => found.get(n)!)
writeFileSync(OUT, JSON.stringify(rows, null, 1) + '\n')
console.log(`\nwrote ${rows.length}/${ours.length} stations to src/stations-geo.json`)
if (missing.length) console.log(`UNMATCHED (fill by hand from the map): ${missing.join(', ')}`)
if (unknown.size) console.log(`source names not recognised (add to ALIASES if they are ours): ${[...unknown].join('; ')}`)
