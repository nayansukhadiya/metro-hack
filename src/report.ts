// Plain-text plan for the control room: paste into WhatsApp, email or the shift log.
import { BRTS, metroName, type Relief } from './brts'
import { fmtHour, type Plan } from './engine'
import { bandLabel, linkLabel, type DayOverview, type JustifyResult } from './justify'
import { SERVICES, SOURCES } from './network'

export function controlRoomText(plan: Plan, overview: DayOverview, just: JustifyResult | null, relief: Relief[]): string {
  const date = new Date(plan.ctx.date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const out: string[] = [`HEADWAY PLAN · ${date} · ${SERVICES[plan.service].name}`]
  if (just?.summary) {
    out.push(just.summary.en)
    if (just.summary.gu) out.push(just.summary.gu)
  }
  const changes = plan.bands.filter((b) => b.change !== 'same')
  out.push('', changes.length ? 'CHANGES' : 'No changes: keep today’s timetable on this line.')
  for (const b of changes) {
    const text = just?.lines.find((l) => l.band === bandLabel(b))
    out.push(
      `• ${bandLabel(b)}  ${b.currentHeadway ? `${b.currentHeadway} min` : 'no service'} → ${b.recommendedHeadway ? `${b.recommendedHeadway} min` : 'none'}  (${linkLabel(b.link)})`,
    )
    if (text?.en) out.push(`  ${text.en}`)
    if (text?.gu) out.push(`  ${text.gu}`)
  }
  const s = plan.summary
  out.push(
    '',
    `Last train ${s.lastTrain ? fmtHour(s.lastTrain) : '—'} (usual ${fmtHour(s.currentLastTrain)}) · trains at peak ${s.peakTrainsNeeded} of ${s.fleet}${s.shortTurn ? ' (short-turn)' : ''}`,
  )
  const mine = relief.filter((r) => r.service === plan.service)
  if (mine.length) {
    out.push('', 'JANMARG BRTS RELIEF')
    for (const r of mine)
      out.push(
        `• ${fmtHour(r.from)}–${fmtHour(r.to)}  +${r.buses} buses/hour ${BRTS[r.route[0]].name} → ${BRTS[r.route[r.route.length - 1]].name} (${r.route.length - 1} stops), metro ${metroName(r.metroFrom)} → ${metroName(r.metroTo)}. ${r.why}.`,
      )
  }
  const other = overview.lines.find((l) => l.line !== SERVICES[plan.service].name)
  if (other) out.push('', `Other line: ${other.line}, ${other.changedBands} change${other.changedBands === 1 ? '' : 's'}.`)
  out.push('', `Justifications: ${just?.provider === 'gemini' ? 'Gemini, numbers checked against the plan' : 'template'}. Sources: ${SOURCES}.`)
  return out.join('\n')
}

/** Clipboard with a fallback for browsers or frames that block the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
