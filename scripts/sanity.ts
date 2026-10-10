// Sanity checks for the planner. Run: npx tsx scripts/sanity.ts  (exits 1 on any failure)
import { MODEL, type CityEvent } from '../src/data.ts'
import { buildContext, computePlan, fmtHour } from '../src/engine.ts'
import { serviceHour } from '../src/flows.ts'
import { reliefPlan } from '../src/brts.ts'
import { buildOverview, factsFor, templateLines, templateSummary, validate } from '../src/justify.ts'
import type { ServiceId } from '../src/network.ts'

let failed = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failed++
}

const MONDAY = '2026-10-26'
const SUNDAY = '2026-10-25'
const match: CityEvent = { id: 'm', date: MONDAY, type: 'stadium', name: 'Cricket match at Motera', attendance: 110000, start: 19.5, end: 23.25 }

// ---- plans, both lines ----
const plan = (date: string, sid: ServiceId, events: CityEvent[] = []) => computePlan(buildContext(date, events, null), sid)
const show = (label: string, p: ReturnType<typeof plan>) => {
  console.log(`\n## ${p.service} · ${label}: peak ${p.summary.peakLoad}/h at ${fmtHour(p.summary.peakHour)}, last train ${p.summary.lastTrain ? fmtHour(p.summary.lastTrain) : '—'}, overflow ${p.summary.peakOverflow}/h`)
  for (const b of p.bands)
    console.log(`  ${fmtHour(b.from)}–${fmtHour(b.to)}  ${b.currentHeadway ?? '-'} → ${b.recommendedHeadway ?? '-'}  ${b.change.padEnd(11)} ${b.peakLoad}/h  ${b.drivers.slice(0, 2).join('; ').slice(0, 110)}`)
}

for (const sid of ['blue', 'redYellow'] as const) {
  const monday = plan(MONDAY, sid)
  show('Normal Monday', monday)
  // demand-driven changes; Red+Yellow bands that only lift a 20–60 min real timetable to the 15-min standard are not counted
  const driven = monday.bands.filter((b) => b.change !== 'same' && !(b.change === 'more' && b.recommendedHeadway === MODEL.maxHeadway))
  check(driven.length <= 1, `${sid} normal Monday: few/no demand-driven changes (${driven.length})`)
  check(monday.summary.peakOverflow === 0, `${sid} normal Monday: no overflow`)

  const navratri = plan('2026-10-11', sid)
  show('Navratri night 1', navratri)
  check((navratri.summary.lastTrain ?? 0) >= 25, `${sid} Navratri night 1 extends to ~02:00 (last train ${fmtHour(navratri.summary.lastTrain ?? 0)})`)

  const matchNight = plan(MONDAY, sid, [match])
  show('Monday + cricket match', matchNight)
  check((matchNight.summary.lastTrain ?? 0) >= 25, `${sid} match night extends to ~02:00 (last train ${fmtHour(matchNight.summary.lastTrain ?? 0)})`)
  if (sid === 'redYellow') check(matchNight.summary.peakOverflow > 0, `match night overflows even at 5 min (${matchNight.summary.peakOverflow}/h) → BRTS relief`)
}
{
  const ry = plan(MONDAY, 'redYellow')
  check(ry.summary.currentBestHeadway === 15, `finding: real Red+Yellow timetable peaks at every ${ry.summary.currentBestHeadway} min (assumed 12)`)
}

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
const mondayRY = plan(MONDAY, 'redYellow')
const lines = templateLines(mondayRY)
const named = /Sachivalaya|GIFT City|Infocity|University|offices|college|railway/i
check(
  mondayRY.bands.some((b) => b.drivers.some((d) => named.test(d))),
  'normal Monday bands name the generators driving them',
)
console.log(`\n${lines.length} template lines, e.g.: ${lines[0]?.en ?? '—'}`)

// ---- Phase C: day summary, Gujarati, number check ----
{
  const ctx = buildContext(MONDAY, [match], null)
  const plans = { blue: computePlan(ctx, 'blue'), redYellow: computePlan(ctx, 'redYellow') }
  const relief = (['blue', 'redYellow'] as const).flatMap((sid) => reliefPlan(plans[sid], (h) => serviceHour(ctx, sid, h)))
  const overview = buildOverview(MONDAY, plans, relief)
  const summary = templateSummary(overview)
  const facts = factsFor(plans.redYellow, overview)
  const lines = templateLines(plans.redYellow)
  check(/02:00/.test(summary.en) && /Janmarg/.test(summary.en), `match-night summary names the 02:00 extension and Janmarg: "${summary.en.slice(0, 90)}…"`)
  check(lines.every((l) => !!l.gu) && !!summary.gu, 'every template line and the summary have Gujarati')
  check(validate([summary, ...lines], facts), 'template summary and lines pass the number check')
  check(!validate([{ en: 'Add 999 buses.' }], facts), 'a summary with an invented number is rejected')
  const normal = templateSummary(buildOverview(MONDAY, { blue: computePlan(buildContext(MONDAY, [], null), 'blue'), redYellow: computePlan(buildContext(MONDAY, [], null), 'redYellow') }, []))
  console.log(`   normal Monday summary: ${normal.en}`)
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
