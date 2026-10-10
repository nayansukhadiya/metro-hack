import { fmtHour, type Band, type Plan } from './engine'

export interface Justification {
  band: string
  en: string
  gu?: string
}
export interface JustifyResult {
  lines: Justification[]
  provider: 'gemini' | 'template'
  note?: string
}

export const bandLabel = (b: Band) => `${fmtHour(b.from)}–${fmtHour(b.to)}`

/** The only facts the language model may use. Numbers it writes are checked against these. */
export function factsFor(plan: Plan) {
  return {
    date: plan.ctx.date,
    dayType: plan.ctx.dayType,
    calendar: plan.ctx.calendar.map((c) => c.name),
    events: plan.ctx.events.map((e) => `${e.name} (${e.attendance} people, ends ${fmtHour(e.end)})`),
    rainMm: plan.ctx.rainMm,
    changes: plan.bands
      .filter((b) => b.change !== 'same')
      .map((b) => ({
        band: bandLabel(b),
        change: b.change,
        currentHeadwayMin: b.currentHeadway,
        recommendedHeadwayMin: b.recommendedHeadway,
        peakLoadPerHour: b.peakLoad,
        currentCapacityPerHour: b.currentCapacity,
        newCapacityPerHour: b.recommendedCapacity,
        drivers: b.drivers,
      })),
  }
}

export function templateLines(plan: Plan): Justification[] {
  return plan.bands
    .filter((b) => b.change !== 'same')
    .map((b) => {
      const why = b.drivers.length ? b.drivers.join('; ') : 'normal demand'
      const load = b.peakLoad.toLocaleString('en-IN')
      let en: string
      switch (b.change) {
        case 'more':
          en = `Run every ${b.recommendedHeadway} min instead of ${b.currentHeadway}. Up to ${load} passengers/hour expected on the busiest link, more than today's ${b.currentCapacity.toLocaleString('en-IN')} capacity. Why: ${why}.`
          break
        case 'fewer':
          en = `Relax to every ${b.recommendedHeadway} min (now ${b.currentHeadway}). Only about ${load} passengers/hour expected, so trains would run under 60% full. Why: ${why}.`
          break
        case 'extend':
          en = `Keep running every ${b.recommendedHeadway} min past the usual last train. About ${load} passengers/hour still expected. Why: ${why}.`
          break
        case 'start-early':
          en = `Start service early, every ${b.recommendedHeadway} min. About ${load} passengers/hour expected. Why: ${why}.`
          break
        default:
          en = ''
      }
      return { band: bandLabel(b), en }
    })
}

const GU_DIGITS = '૦૧૨૩૪૫૬૭૮૯'
const toAscii = (s: string) => s.replace(/[૦-૯]/g, (d) => String(GU_DIGITS.indexOf(d)))
const numbersIn = (s: string) => (toAscii(s).replace(/,/g, '').match(/\d+(\.\d+)?/g) ?? []).map(Number)

/** Reject any draft that contains a number not present in the facts. */
export function validate(lines: Justification[], facts: unknown): boolean {
  const allowed = new Set(numbersIn(JSON.stringify(facts)))
  return lines.every((l) => [...numbersIn(l.en), ...numbersIn(l.gu ?? '')].every((n) => allowed.has(n)))
}

export async function justify(plan: Plan): Promise<JustifyResult> {
  const fallback = templateLines(plan)
  if (!fallback.length) return { lines: [], provider: 'template' }
  const facts = factsFor(plan)
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
    const data = (await res.json()) as { lines?: Justification[] }
    const lines = data.lines ?? []
    if (lines.length !== facts.changes.length) throw new Error('wrong number of lines')
    if (!validate(lines, facts)) return { lines: fallback, provider: 'template', note: 'Gemini draft used a number not in the plan, so the template was used.' }
    return { lines, provider: 'gemini' }
  } catch (e) {
    return { lines: fallback, provider: 'template', note: `Gemini unavailable (${(e as Error).message}); template used.` }
  }
}
