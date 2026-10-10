// Sanity checks for the planner. Run: npx tsx scripts/sanity.ts  (exits 1 on any failure)
import type { CityEvent } from '../src/data.ts'
import { buildContext, computePlan, fmtHour } from '../src/engine.ts'
import { serviceHour } from '../src/flows.ts'
import { templateLines } from '../src/justify.ts'
import type { ServiceId } from '../src/network.ts'

let failed = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}

const MONDAY = '2026-10-26'
const SUNDAY = '2026-10-25'
const match: CityEvent = { id: 'm', date: MONDAY, type: 'stadium', name: 'Cricket match at Motera', attendance: 110000, start: 19.5, end: 23.25 }

// ---- plan (Red+Yellow corridor) ----
const plan = (date: string, events: CityEvent[] = []) => computePlan(buildContext(date, events, null))
const show = (label: string, p: ReturnType<typeof plan>) => {
  console.log(`\n## ${label}: peak ${p.summary.peakLoad}/h at ${fmtHour(p.summary.peakHour)}, last train ${p.summary.lastTrain ? fmtHour(p.summary.lastTrain) : '—'}`)
  for (const b of p.bands)
    console.log(`  ${fmtHour(b.from)}–${fmtHour(b.to)}  ${b.currentHeadway ?? '-'} → ${b.recommendedHeadway ?? '-'}  ${b.change.padEnd(11)} ${b.peakLoad}/h  ${b.drivers.join('; ')}`)
}

const monday = plan(MONDAY)
show('Normal Monday', monday)
const changes = monday.bands.filter((b) => b.change !== 'same')
check(changes.length <= 1, `normal Monday: few/no changes (${changes.length})`)

const navratri = plan('2026-10-11')
show('Navratri night 1', navratri)
check((navratri.summary.lastTrain ?? 0) >= 25, `Navratri night 1 extends to ~02:00 (last train ${fmtHour(navratri.summary.lastTrain ?? 0)})`)

const matchNight = plan(MONDAY, [match])
show('Monday + cricket match', matchNight)
check((matchNight.summary.lastTrain ?? 0) >= 25, `match night extends to ~02:00 (last train ${fmtHour(matchNight.summary.lastTrain ?? 0)})`)

const sunday = plan(SUNDAY)
show('Sunday', sunday)

// ---- generators: when and where ----
const hours = Array.from({ length: 18 }, (_, i) => i + 6)
const series = (date: string, sid: ServiceId, station: string, key: 'boardings' | 'alightings') => {
  const ctx = buildContext(date, [], null)
  return hours.map((h) => serviceHour(ctx, sid, h)[key][station] ?? 0)
}
const peakHour = (xs: number[]) => hours[xs.indexOf(Math.max(...xs))]

for (const [sid, st] of [
  ['redYellow', 'sachivalaya'],
  ['redYellow', 'gift-city'],
] as const) {
  const inH = peakHour(series(MONDAY, sid, st, 'alightings'))
  const outH = peakHour(series(MONDAY, sid, st, 'boardings'))
  check(inH >= 9 && inH <= 10, `${st}: morning arrivals peak ${fmtHour(inH)} (expect 09–10)`)
  check(outH >= 18 && outH <= 19, `${st}: evening departures peak ${fmtHour(outH)} (expect 18–19)`)
}
for (const [sid, st] of [
  ['blue', 'gujarat-university'],
  ['redYellow', 'pdeu'],
] as const) {
  const inH = peakHour(series(MONDAY, sid, st, 'alightings'))
  check(inH >= 7 && inH <= 9, `${st}: college arrivals peak ${fmtHour(inH)} (expect morning 07–09)`)
}
{
  const out = series(SUNDAY, 'redYellow', 'sachivalaya', 'boardings')
  const at = (h: number) => out[hours.indexOf(h)]
  check(at(18) < 1.3 * at(14), `Sunday: no office peak at Sachivalaya (18:00 ${Math.round(at(18))} vs 14:00 ${Math.round(at(14))})`)
}

// ---- justifications name generators ----
const lines = templateLines(monday).concat(templateLines(navratri))
const named = /Sachivalaya|GIFT City|Infocity|University|offices|college|railway/i
check(
  monday.bands.some((b) => b.drivers.some((d) => named.test(d))),
  'normal Monday bands name the generators driving them',
)
console.log(`\n${lines.length} template lines, e.g.: ${lines[0]?.en ?? '—'}`)

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
