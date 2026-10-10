// Presentation logic for the control room: alert list and change classification. Reads the plan; computes nothing new.
import type { Relief } from '../brts'
import { MODEL } from '../data'
import { fmtHour, type Band, type Plan } from '../engine'
import { n } from '../mapUtil'
import { SERVICES, type ServiceId } from '../network'

const SIDS: ServiceId[] = ['redYellow', 'blue']

export type Severity = 'critical' | 'warning' | 'info'
export interface Alert {
  sev: Severity
  title: string
  text: string
  href?: string
}
export function buildAlerts(plans: Record<ServiceId, Plan>, relief: Relief[], ctx: Plan['ctx']): Alert[] {
  const out: Alert[] = []
  for (const sid of SIDS) {
    const s = plans[sid].summary
    const name = SERVICES[sid].name
    const tight = plans[sid].hours.filter((r) => r.overflow > 0)
    if (tight.length) {
      const buses = Math.max(0, ...relief.filter((r) => r.service === sid).map((r) => r.buses))
      const busesAtWorst = relief.filter((r) => r.service === sid && r.overflow === s.peakOverflow).reduce((a, r) => a + r.buses, 0) || buses
      out.push({
        sev: 'critical',
        title: `${name}: metro full ${fmtHour(tight[0].hour)}–${fmtHour(tight[tight.length - 1].hour + 1)}`,
        text: `${n(s.peakOverflow)} passengers/hour cannot board even at ${s.fleetFloor}-min trains.${busesAtWorst ? ` Janmarg relief: +${busesAtWorst} buses/hour.` : ''}`,
        href: '#relief',
      })
    }
    if (s.fleetLimited)
      out.push({
        sev: 'critical',
        title: `${name}: fleet shortage`,
        text: `${s.fleet} trainsets allow every ${s.fleetFloor} min at best; ${MODEL.minHeadway}-min trains need more. See fleet options.`,
        href: '#fleet',
      })
    if (s.lastTrain && s.lastTrain > s.currentLastTrain)
      out.push({ sev: 'warning', title: `${name}: extend to ${fmtHour(s.lastTrain)}`, text: `Last train is usually ${fmtHour(s.currentLastTrain)}; demand continues after it.`, href: '#plan' })
    if (s.leftBehindCurrent > 500)
      out.push({ sev: 'warning', title: `${name}: ${n(s.leftBehindCurrent)} left behind`, text: 'Passengers who could not board if today’s timetable runs unchanged.', href: '#plan' })
    if (s.currentWorstHeadway != null && s.currentWorstHeadway > MODEL.maxHeadway)
      out.push({
        sev: 'warning',
        title: `${name}: timetable gaps up to ${s.currentWorstHeadway} min`,
        text: `Today’s timetable is worse than the ${MODEL.maxHeadway}-min service standard in some hours.`,
        href: '#plan',
      })
  }
  if (ctx.rainMm != null && ctx.rainMm >= MODEL.rainHeavyMm) out.push({ sev: 'info', title: `Heavy rain: ${ctx.rainMm} mm`, text: 'Demand raised slightly (GMRC counts on rain days stayed near normal).' })
  for (const c of ctx.calendar) out.push({ sev: 'info', title: c.name, text: c.kind === 'festival-night' ? 'Late-night return wave expected.' : c.kind === 'low-travel' ? 'Very low travel; trains may be thinned.' : 'Holiday: no commute peak.' })
  const order: Severity[] = ['critical', 'warning', 'info']
  return out.sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev))
}

export type ChangeKind = 'demand' | 'gap' | 'fewer' | 'extend' | 'start-early' | 'same'
export function changeKind(b: Band): ChangeKind {
  if (b.change === 'same') return 'same'
  if (b.change === 'fewer') return 'fewer'
  if (b.change === 'extend') return 'extend'
  if (b.change === 'start-early') return 'start-early'
  return b.currentHeadway != null && b.currentHeadway > MODEL.maxHeadway && b.peakNeed <= b.currentCapacity ? 'gap' : 'demand'
}
