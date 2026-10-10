import { fmtHour, type Band, type Plan } from './engine'
import { MODEL } from './data'
import { BRTS, type Relief } from './brts'
import { SERVICES, STATIONS, type ServiceId } from './network'

export interface Justification {
  band: string
  en: string
  gu?: string
}
export interface Summary {
  en: string
  gu?: string
}
export interface JustifyResult {
  lines: Justification[]
  summary: Summary
  provider: 'gemini' | 'template'
  note?: string
}

/** Whole-day facts across both lines and Janmarg relief, for the one-line summary. */
export interface DayOverview {
  day: string // e.g. "Mon 26 Oct"
  lines: {
    line: string
    changedBands: number
    gapFills: number // changes that only lift a 20–60 min timetable gap to the service standard
    demandChanges: number // the rest: changes driven by demand
    fewerBands: number
    shortestHeadwayMin: number | null
    longestHeadwayMin: number | null
    lastTrain: string | null
    usualLastTrain: string
    trainsNeeded: number
    fleet: number
    fleetLimited: boolean
    fleetFloorMin: number
    overflowPerHour: number
  }[]
  brtsRelief: { band: string; line: string; fromStop: string; toStop: string; extraBusesPerHour: number }[]
}

export const bandLabel = (b: Band) => `${fmtHour(b.from)}–${fmtHour(b.to)}`
/** Events, holidays and rain first, then the generators; at most three reasons. */
export const topDrivers = (drivers: string[]) => {
  const generator = (d: string) => /\((arrive|leave|all day)/.test(d)
  return [...drivers.filter((d) => !generator(d)), ...drivers.filter(generator)].slice(0, 3)
}
export const linkLabel = (l: { from: string; to: string }) => `${STATIONS[l.from]?.name ?? l.from} → ${STATIONS[l.to]?.name ?? l.to}`

/** A 'more' band that only lifts a long timetable gap to the service standard, with demand well inside capacity. */
const isGapFill = (b: Band) =>
  b.change === 'more' && b.currentHeadway != null && b.currentHeadway > MODEL.maxHeadway && b.peakNeed <= b.currentCapacity

export function buildOverview(date: string, plans: Record<ServiceId, Plan>, relief: Relief[]): DayOverview {
  return {
    day: new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    lines: (['redYellow', 'blue'] as const).map((sid) => {
      const p = plans[sid]
      const recs = p.hours.map((r) => r.recommendedHeadway).filter((x): x is number => x != null)
      const changed = p.bands.filter((b) => b.change !== 'same')
      return {
        line: SERVICES[sid].name,
        changedBands: changed.length,
        gapFills: changed.filter(isGapFill).length,
        demandChanges: changed.filter((b) => !isGapFill(b)).length,
        fewerBands: changed.filter((b) => b.change === 'fewer').length,
        shortestHeadwayMin: recs.length ? Math.min(...recs) : null,
        longestHeadwayMin: recs.length ? Math.max(...recs) : null,
        lastTrain: p.summary.lastTrain ? fmtHour(p.summary.lastTrain) : null,
        usualLastTrain: fmtHour(p.summary.currentLastTrain),
        trainsNeeded: p.summary.peakTrainsNeeded,
        fleet: p.summary.fleet,
        fleetLimited: p.summary.fleetLimited,
        fleetFloorMin: p.summary.fleetFloor,
        overflowPerHour: p.summary.peakOverflow,
      }
    }),
    brtsRelief: relief.map((r) => ({
      band: `${fmtHour(r.from)}–${fmtHour(r.to)}`,
      line: SERVICES[r.service].name,
      fromStop: BRTS[r.route[0]].name,
      toStop: BRTS[r.route[r.route.length - 1]].name,
      extraBusesPerHour: r.buses,
    })),
  }
}

/** The only facts the language model may use. Numbers it writes are checked against these. */
export function factsFor(plan: Plan, overview: DayOverview) {
  return {
    dayOverview: overview,
    date: plan.ctx.date,
    line: SERVICES[plan.service].name,
    dayType: plan.ctx.dayType,
    calendar: plan.ctx.calendar.map((c) => c.name),
    events: plan.ctx.events.map((e) => `${e.name} (${e.attendance} people, ends ${fmtHour(e.end)})`),
    rainMm: plan.ctx.rainMm,
    thinOutBelowPercentFull: 60,
    serviceStandardMaxHeadwayMin: MODEL.maxHeadway,
    changes: plan.bands
      .filter((b) => b.change !== 'same')
      .map((b) => ({
        band: bandLabel(b),
        change: b.change,
        currentHeadwayMin: b.currentHeadway,
        recommendedHeadwayMin: b.recommendedHeadway,
        peakLoadPerHour: b.peakLoad,
        queuedFromPreviousHour: Math.max(0, b.peakNeed - b.peakLoad),
        busiestLink: linkLabel(b.link),
        currentCapacityPerHour: b.currentCapacity,
        newCapacityPerHour: b.recommendedCapacity,
        drivers: topDrivers(b.drivers),
      })),
  }
}

export function templateLines(plan: Plan): Justification[] {
  return plan.bands
    .filter((b) => b.change !== 'same')
    .map((b) => {
      const why = b.drivers.length ? topDrivers(b.drivers).join('; ') : 'normal demand'
      const load = b.peakLoad.toLocaleString('en-IN')
      const queued = Math.max(0, b.peakNeed - b.peakLoad)
      const link = linkLabel(b.link)
      let en: string
      switch (b.change) {
        case 'more':
          en =
            b.peakNeed > b.currentCapacity
              ? `Run every ${b.recommendedHeadway} min instead of ${b.currentHeadway}. Up to ${load} passengers/hour expected on ${link}${queued ? `, plus ${queued.toLocaleString('en-IN')} still queued from the hour before` : ''}, more than today's ${b.currentCapacity.toLocaleString('en-IN')} capacity. Why: ${why}.`
              : b.currentHeadway != null && b.currentHeadway > MODEL.maxHeadway
                ? `Run every ${b.recommendedHeadway} min instead of ${b.currentHeadway}: a ${b.currentHeadway}-minute gap is longer than today's ${b.recommendedHeadway}-minute service standard. About ${load} passengers/hour on ${link}. Why: ${why}.`
                : `Run every ${b.recommendedHeadway} min instead of ${b.currentHeadway}. Up to ${load} passengers/hour expected on ${link}, which leaves no comfortable room at today's ${b.currentCapacity.toLocaleString('en-IN')} capacity. Why: ${why}.`
          break
        case 'fewer':
          en = `Relax to every ${b.recommendedHeadway} min (now ${b.currentHeadway}). Only about ${load} passengers/hour expected, so trains would run under 60% full. Why: ${why}.`
          break
        case 'extend':
          en = `Keep running every ${b.recommendedHeadway} min past the usual last train. About ${load} passengers/hour still expected${queued ? `, plus ${queued.toLocaleString('en-IN')} still queued from the hour before` : ''}. Why: ${why}.`
          break
        case 'start-early':
          en = `Start service early, every ${b.recommendedHeadway} min. About ${load} passengers/hour expected. Why: ${why}.`
          break
        default:
          en = ''
      }
      return { band: bandLabel(b), en, gu: guLine(b) }
    })
}

// ---- Gujarati template (Western digits, station names in English) ----
const GU_REASONS: [RegExp, string][] = [
  [/match|IPL|ODI|T20|cricket/i, 'ક્રિકેટ મેચ'],
  [/Concert/i, 'કોન્સર્ટ'],
  [/Carnival/i, 'કાંકરિયા કાર્નિવલ'],
  [/marathon/i, 'મેરેથોન'],
  [/Garba/i, 'ગરબા'],
  [/fans|crowd/i, 'મોટો કાર્યક્રમ'],
  [/Navratri/i, 'નવરાત્રિ'],
  [/New Year/i, 'નવા વર્ષની રાત'],
  [/holiday/i, 'જાહેર રજા'],
  [/very low travel/i, 'તહેવાર: ઓછી મુસાફરી'],
  [/rain/i, 'ભારે વરસાદ'],
  [/exam|students travelling|students returning/i, 'પરીક્ષા'],
  [/college|University|students/i, 'કોલેજ સમય'],
  [/govt|offices|IT park|banks|staff/i, 'ઓફિસ સમય'],
  [/railway|rail/i, 'રેલવે મુસાફરો'],
  [/shift|industrial/i, 'ફેક્ટરી શિફ્ટ'],
  [/market/i, 'બજાર સમય'],
  [/temple|tirth|visitors/i, 'મંદિર દર્શન'],
  [/queue carries over/i, 'ભીડ આગલા કલાકમાં જાય છે'],
]
const guReason = (drivers: string[]) => {
  const out: string[] = []
  for (const d of topDrivers(drivers))
    for (const [re, gu] of GU_REASONS)
      if (re.test(d)) {
        if (!out.includes(gu)) out.push(gu)
        break
      }
  return out.length ? ` કારણ: ${out.join(', ')}.` : ''
}

function guLine(b: Band): string {
  const load = b.peakLoad.toLocaleString('en-IN')
  const why = guReason(b.drivers)
  switch (b.change) {
    case 'more':
      return b.peakNeed <= b.currentCapacity && b.currentHeadway != null && b.currentHeadway > MODEL.maxHeadway
        ? `દર ${b.recommendedHeadway} મિનિટે ટ્રેન ચલાવો (હાલ ${b.currentHeadway} મિનિટ): સમયપત્રકમાં ${b.recommendedHeadway} મિનિટથી લાંબો ગાળો છે.${why}`
        : `દર ${b.recommendedHeadway} મિનિટે ટ્રેન ચલાવો (હાલ ${b.currentHeadway} મિનિટ): ${linkLabel(b.link)} પર કલાકે ${load} મુસાફરો.${why}`
    case 'fewer':
      return `દર ${b.recommendedHeadway} મિનિટે ટ્રેન પૂરતી (હાલ ${b.currentHeadway} મિનિટ): કલાકે ફક્ત ${load} મુસાફરો, ટ્રેન 60% કરતાં ઓછી ભરેલી.${why}`
    case 'extend':
      return `છેલ્લી ટ્રેન પછી પણ દર ${b.recommendedHeadway} મિનિટે ચાલુ રાખો: કલાકે ${load} મુસાફરો બાકી.${why}`
    case 'start-early':
      return `સેવા વહેલી શરૂ કરો, દર ${b.recommendedHeadway} મિનિટે: કલાકે ${load} મુસાફરો.${why}`
    default:
      return ''
  }
}

// ---- one-line summary for the whole day ----
export function templateSummary(o: DayOverview): Summary {
  const busy = o.lines.filter((l) => l.changedBands > 0)
  if (!busy.length && !o.brtsRelief.length)
    return { en: `${o.day}: a normal day. Keep today's timetable on both lines.`, gu: `${o.day}: સામાન્ય દિવસ. બંને લાઇન પર હાલનું સમયપત્રક જ રાખો.` }
  const en: string[] = []
  const gu: string[] = []
  for (const l of busy) {
    const late = l.lastTrain && l.lastTrain !== l.usualLastTrain && l.lastTrain < '06' ? l.lastTrain : null
    const real = l.demandChanges
    const parts: string[] = []
    const guParts: string[] = []
    if (real > 0) {
      parts.push(`${real} change${real > 1 ? 's' : ''}`)
      guParts.push(`${real} ફેરફાર`)
    }
    if (l.gapFills > 0) {
      parts.push(`fill ${l.gapFills} timetable gap${l.gapFills > 1 ? 's' : ''} to the service standard`)
      guParts.push(`સમયપત્રકના ${l.gapFills} ગાળા ભરો`)
    }
    if (l.fewerBands > 0 && l.longestHeadwayMin != null) {
      parts.push(`fewer trains, down to every ${l.longestHeadwayMin} min`)
      guParts.push(`ઓછી ટ્રેન, દર ${l.longestHeadwayMin} મિનિટ સુધી`)
    }
    if (late) {
      parts.push(`run to ${late}`)
      guParts.push(`${late} સુધી ટ્રેન`)
    }
    if (l.shortestHeadwayMin != null && l.shortestHeadwayMin <= 6) {
      parts.push(`every ${l.shortestHeadwayMin} min at the busiest`)
      guParts.push(`ભીડમાં દર ${l.shortestHeadwayMin} મિનિટે`)
    }
    if (l.fleetLimited) {
      parts.push(`the fleet of ${l.fleet} trainsets limits trains to every ${l.fleetFloorMin} min`)
      guParts.push(`${l.fleet} ટ્રેનથી દર ${l.fleetFloorMin} મિનિટથી વધુ નહીં`)
    }
    en.push(`${l.line}: ${parts.join(', ')}`)
    gu.push(`${l.line}: ${guParts.join(', ')}`)
  }
  if (o.brtsRelief.length) {
    const top = o.brtsRelief.reduce((a, b) => (b.extraBusesPerHour > a.extraBusesPerHour ? b : a))
    const buses = o.brtsRelief.filter((r) => r.band === top.band).reduce((a, r) => a + r.extraBusesPerHour, 0)
    en.push(`Janmarg: +${buses} buses/hour ${top.band} from ${top.fromStop}`)
    gu.push(`જનમાર્ગ: ${top.band} દરમિયાન ${top.fromStop}થી કલાકે +${buses} બસ`)
  }
  return { en: `${o.day}: ${en.join('. ')}.`, gu: `${o.day}: ${gu.join('. ')}.` }
}

const GU_DIGITS = '૦૧૨૩૪૫૬૭૮૯'
const toAscii = (s: string) => s.replace(/[૦-૯]/g, (d) => String(GU_DIGITS.indexOf(d)))
const numbersIn = (s: string) => (toAscii(s).replace(/,/g, '').match(/\d+(\.\d+)?/g) ?? []).map(Number)

/** Reject any draft that contains a number not present in the facts. */
export function validate(lines: (Justification | Summary)[], facts: unknown): boolean {
  const allowed = new Set(numbersIn(JSON.stringify(facts)))
  return lines.every((l) => [...numbersIn(l.en), ...numbersIn(l.gu ?? '')].every((n) => allowed.has(n)))
}

export async function justify(plan: Plan, overview: DayOverview): Promise<JustifyResult> {
  const fallback = templateLines(plan)
  const summary = templateSummary(overview)
  const facts = factsFor(plan, overview)
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch('/api/justify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ facts }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { lines?: Justification[]; summary?: string; summaryGu?: string }
    const lines = data.lines ?? []
    if (lines.length !== facts.changes.length) throw new Error('wrong number of lines')
    const gemSummary: Summary | null = data.summary ? { en: data.summary, gu: data.summaryGu } : null
    const notes: string[] = []
    const okLines = validate(lines, facts)
    const okSummary = !!gemSummary && validate([gemSummary], facts)
    if (!okLines) notes.push('a Gemini line used a number not in the plan, so the template was used')
    if (gemSummary && !okSummary) notes.push('the Gemini summary used a number not in the plan, so the template summary was used')
    if (!okLines && !okSummary) return { lines: fallback, summary, provider: 'template', note: `Gemini: ${notes.join('; ')}.` }
    return {
      lines: okLines ? lines : fallback,
      summary: okSummary ? gemSummary! : summary,
      provider: 'gemini',
      ...(notes.length ? { note: `Gemini: ${notes.join('; ')}.` } : {}),
    }
  } catch (e) {
    return { lines: fallback, summary, provider: 'template', note: `Gemini unavailable (${(e as Error).message}); template used.` }
  }
}
