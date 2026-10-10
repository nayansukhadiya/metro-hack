import { CALENDAR, MODEL, type CalendarDay, type CityEvent } from './data'
import { serviceHour } from './flows'
import { OPERATIONS, currentHeadway, type DayPattern, type ServiceId } from './network'

export interface DayContext {
  date: string
  weekday: number // 0 Sun … 6 Sat
  dayType: 'weekday' | 'saturday' | 'sunday'
  calendar: CalendarDay[]
  events: CityEvent[]
  rainMm: number | null
}

export interface HourRow {
  hour: number // 6 … 26 (26 = 02:00 next day)
  load: number // passengers/hour on busiest link, peak direction
  need: number // load + queue carried over from the previous hour
  carried: number // what the recommended service can move
  overflow: number // left over even at the shortest headway (BRTS relief)
  trainsNeeded: number // trainsets in service for the recommended headway
  trainsNow: number // trainsets in service for today's timetable
  shortTurnHour: boolean
  backlog: number // still waiting at end of hour
  currentHeadway: number | null
  recommendedHeadway: number | null
  currentCapacity: number
  recommendedCapacity: number
  crush: boolean
  link: { from: string; to: string } // busiest link, in travel direction
  drivers: string[]
}

export interface Band {
  from: number
  to: number
  currentHeadway: number | null
  recommendedHeadway: number | null
  peakLoad: number
  peakNeed: number
  currentCapacity: number
  recommendedCapacity: number
  link: { from: string; to: string }
  drivers: string[]
  change: 'more' | 'fewer' | 'same' | 'extend' | 'start-early'
}

export interface Plan {
  ctx: DayContext
  service: ServiceId
  hours: HourRow[]
  bands: Band[]
  summary: {
    peakLoad: number
    peakHour: number
    peakLink: { from: string; to: string }
    extraTripsPerDirection: number
    lastTrain: number | null
    currentLastTrain: number
    peakTrainsNeeded: number
    fleet: number
    /** shortest headway this fleet can sustain */
    fleetFloor: number
    /** the fleet, not the 5-minute limit, stopped the plan from carrying demand */
    fleetLimited: boolean
    peakTrainsNow: number
    shortTurn: boolean
    leftBehindCurrent: number
    currentBestHeadway: number | null
    currentWorstHeadway: number | null
    /** largest hourly queue the plan cannot carry even at the 5-minute limit (→ BRTS relief) */
    peakOverflow: number
  }
}

const WEEKDAY_PROFILE: Record<number, number> = {
  6: 0.03, 7: 0.06, 8: 0.1, 9: 0.11, 10: 0.08, 11: 0.05, 12: 0.045, 13: 0.045, 14: 0.045,
  15: 0.05, 16: 0.06, 17: 0.09, 18: 0.11, 19: 0.08, 20: 0.05, 21: 0.03, 22: 0.015,
}
const HOLIDAY_PROFILE: Record<number, number> = {
  6: 0.02, 7: 0.03, 8: 0.04, 9: 0.06, 10: 0.08, 11: 0.08, 12: 0.08, 13: 0.08, 14: 0.08,
  15: 0.08, 16: 0.09, 17: 0.09, 18: 0.09, 19: 0.08, 20: 0.06, 21: 0.04, 22: 0.02,
}
const norm = (p: Record<number, number>) => {
  const s = Object.values(p).reduce((a, b) => a + b, 0)
  return (h: number) => (p[h] ?? 0) / s
}
const weekdayShare = norm(WEEKDAY_PROFILE)
/** Flat holiday curve, also the shape of background (non-generator) trips every day. */
export const holidayShare = norm(HOLIDAY_PROFILE)

export function fmtHour(h: number): string {
  const hh = Math.floor(h) % 24
  const mm = Math.round((h - Math.floor(h)) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

export function buildContext(date: string, events: CityEvent[], rainMm: number | null): DayContext {
  const weekday = new Date(date + 'T12:00:00').getDay()
  const dayType = weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday'
  return {
    date,
    weekday,
    dayType,
    calendar: CALENDAR.filter((c) => c.date === date),
    events: events.filter((e) => e.date === date),
    rainMm,
  }
}

function roundHeadway(maxMinutes: number): number {
  // largest allowed headway that still meets the needed frequency
  const ok = MODEL.allowedHeadways.filter((h) => h <= maxMinutes)
  return ok.length ? Math.max(...ok) : MODEL.minHeadway
}

/** Day-level demand: which calendar rules apply, hourly shape and network journeys for the day. */
export function dayModel(ctx: DayContext) {
  const holiday = ctx.calendar.find((c) => c.kind === 'holiday')
  const lowTravel = ctx.calendar.find((c) => c.kind === 'low-travel')
  const festivalNight = ctx.calendar.find((c) => c.kind === 'festival-night')
  const workingDay = ctx.dayType !== 'sunday' && !holiday && !lowTravel

  const dayFactor = lowTravel
    ? MODEL.dayFactor['low-travel']
    : holiday
      ? MODEL.dayFactor.holiday
      : MODEL.dayFactor[ctx.dayType]
  const share = workingDay ? weekdayShare : holidayShare
  const rainy = ctx.rainMm != null && ctx.rainMm >= MODEL.rainHeavyMm
  const networkDaily = MODEL.networkDailyJourneys * dayFactor * (rainy ? 1 + MODEL.rainUplift : 1)
  return { holiday, lowTravel, festivalNight, workingDay, share, rainy, networkDaily }
}

/** Extra journeys per festival night (corridor figure from MODEL; other festivals 10k). */
export function festivalJourneys(ctx: DayContext, name: string): number {
  const weekend = ctx.weekday === 0 || ctx.weekday === 5 || ctx.weekday === 6
  return name.startsWith('Navratri') ? (weekend ? MODEL.navratriJourneys.weekend : MODEL.navratriJourneys.weekday) : 10_000
}

const linkCal: Partial<Record<ServiceId, number>> = {}
/**
 * Busiest-link calibration per line: ordinary demand is scaled so that on a normal weekday
 * (Mon 26 Oct 2026) the busiest hour fills today's best peak service to PEAK_FILL. The raw gravity
 * model counts every trip on every link it crosses within one clock hour, which overstates the
 * peak; the original corridor model was tuned the same way (2,074 of 2,250). Events are not scaled.
 */
export function linkCalibration(sid: ServiceId): number {
  if (linkCal[sid] != null) return linkCal[sid]!
  const ref = buildContext('2026-10-26', [], null)
  let raw = 0
  let best = 99
  for (let h = 5; h <= 26; h++) {
    raw = Math.max(raw, serviceHour(ref, sid, h).busiest.load)
    best = Math.min(best, currentHeadway(sid, 'weekday', h) ?? 99)
  }
  return (linkCal[sid] = (MODEL.peakFill * (60 / best) * MODEL.trainCapacityComfort) / raw)
}

/** Smallest allowed headway that is at least x minutes. */
const ceilHeadway = (x: number) => MODEL.allowedHeadways.find((h) => h >= x - 1e-9) ?? Math.ceil(x)

/** Trainsets needed to run every `headway` min: full run, or short-turn when the full run needs more than the fleet. */
export function trainsFor(sid: ServiceId, headway: number, fleet: number): { trains: number; shortTurn: boolean } {
  const ops = OPERATIONS[sid]
  const full = Math.ceil(ops.cycleFullMin / headway)
  if (full <= fleet || ops.cycleShortTurnMin == null) return { trains: full, shortTurn: false }
  return { trains: Math.ceil(ops.cycleShortTurnMin / headway), shortTurn: true }
}

export function computePlan(ctx: DayContext, sid: ServiceId = 'redYellow', fleetSize?: number): Plan {
  const { holiday, lowTravel, workingDay, rainy } = dayModel(ctx)
  const ops = OPERATIONS[sid]
  const fleet = fleetSize ?? ops.fleet
  // the fleet sets the shortest headway it can sustain (short-turn where the line has one)
  const fleetFloor = Math.max(
    MODEL.minHeadway,
    Math.min(ceilHeadway(ops.cycleFullMin / fleet), ops.cycleShortTurnMin != null ? ceilHeadway(ops.cycleShortTurnMin / fleet) : Infinity),
  )

  // the timetable that would run today (holidays run the Sunday pattern)
  const pattern: DayPattern = workingDay ? ctx.dayType : 'sunday'
  const current = (h: number) => currentHeadway(sid, pattern, h)

  const hours: HourRow[] = []
  let backlog = 0
  let backlogCurrent = 0
  let leftBehindCurrent = 0

  for (let h = 5; h <= 26; h++) {
    // passengers/hour on the busiest link and direction this hour (gravity model over the real line)
    const sh = serviceHour(ctx, sid, h, linkCalibration(sid))
    const load = sh.busiest.load
    const drivers = [...sh.drivers]
    if (holiday) drivers.push(`${holiday.name} holiday: no commute peak`)
    if (lowTravel) drivers.push(`${lowTravel.name}: very low travel`)
    if (rainy && load > 0) drivers.push(`heavy rain forecast (${ctx.rainMm} mm)`)
    let crush = sh.crush

    // recommended service
    const cap = crush ? MODEL.trainCapacityCrush : MODEL.trainCapacityComfort
    if (cap === MODEL.trainCapacityCrush) crush = true
    const need = load + backlog
    const maxH = lowTravel ? MODEL.maxHeadwayLowTravel : MODEL.maxHeadway
    const inService = current(h) != null && h <= 23
    const firstServiceHour = [5, 6, 7, 8, 9].find((x) => current(x) != null) ?? 6
    let recH: number | null = null
    const run = inService || (h < firstServiceHour ? need >= MODEL.minLoadToStartEarly : need >= MODEL.minLoadToExtend)
    if (run) {
      const tph = Math.ceil(need / cap)
      recH = roundHeadway(Math.min(maxH, 60 / Math.max(tph, 1)))
      if (recH < fleetFloor) recH = fleetFloor
      // only thin out service when trains would be under 60% full, and only on days the published
      // timetable was not written for (holidays, low-travel days)
      const cur = current(h)
      const thinOk = !MODEL.thinOnlyOnSpecialDays || holiday || lowTravel
      if (inService && cur != null && recH > cur && (!thinOk || need > 0.6 * (60 / cur) * cap)) recH = cur
    }
    const recCap = recH ? (60 / recH) * cap : 0
    const carried = Math.min(need, recCap)
    // what even the 5-minute limit cannot carry this hour: the surge to hand to Janmarg BRTS
    const overflow = recH === fleetFloor ? Math.max(0, need - recCap) : 0
    backlog = recH ? Math.max(0, need - recCap) : 0 // no train: riders choose another mode

    const curH = h <= 23 ? current(h) : null
    const curCap = curH ? (60 / curH) * cap : 0
    const needCur = load + backlogCurrent
    backlogCurrent = Math.max(0, needCur - curCap)
    if (!curH) {
      leftBehindCurrent += backlogCurrent
      backlogCurrent = 0
    }

    if (backlog > 0 && recH === fleetFloor)
      drivers.push(
        fleetFloor > MODEL.minHeadway
          ? `fleet limit: ${fleet} trainsets allow every ${fleetFloor} min at best, queue carries over`
          : 'demand above the 5-minute limit: queue carries over',
      )
    const run_ = recH ? trainsFor(sid, recH, fleet) : { trains: 0, shortTurn: false }
    hours.push({
      hour: h,
      load: Math.round(load),
      need: Math.round(need),
      carried: Math.round(carried),
      overflow: Math.round(overflow),
      trainsNeeded: run_.trains,
      trainsNow: curH ? trainsFor(sid, curH, fleet).trains : 0,
      shortTurnHour: run_.shortTurn,
      backlog: Math.round(backlog),
      currentHeadway: curH,
      recommendedHeadway: recH,
      currentCapacity: Math.round(curCap),
      recommendedCapacity: Math.round(recCap),
      crush,
      link: { from: sh.busiest.dir === 'fwd' ? sh.busiest.edge.a : sh.busiest.edge.b, to: sh.busiest.dir === 'fwd' ? sh.busiest.edge.b : sh.busiest.edge.a },
      drivers: [...new Set(drivers)],
    })
  }

  // keep service continuous: fill gaps between the normal last train and a late extension
  const lastRun = Math.max(...hours.filter((r) => r.recommendedHeadway).map((r) => r.hour))
  for (const r of hours) {
    if (!r.recommendedHeadway && r.hour > 12 && r.hour < lastRun) {
      r.recommendedHeadway = MODEL.maxHeadway
      r.recommendedCapacity = Math.round((60 / MODEL.maxHeadway) * MODEL.trainCapacityComfort)
      r.drivers.push('bridge to the late extension')
    }
  }

  const served = hours.filter((r) => r.recommendedHeadway || r.currentHeadway)
  const bands = toBands(served)
  const peak = hours.reduce((a, b) => (b.load > a.load ? b : a))
  const tph = (h: number | null) => (h ? 60 / h : 0)
  const extra = hours.reduce((s, r) => s + Math.max(0, tph(r.recommendedHeadway) - tph(r.currentHeadway)), 0)
  const lastRec = [...hours].reverse().find((r) => r.recommendedHeadway)
  const lastCur = [...hours].reverse().find((r) => r.currentHeadway)
  const peakTrainsNeeded = Math.max(0, ...hours.map((r) => r.trainsNeeded))
  const shortTurn = hours.some((r) => r.shortTurnHour)
  const fleetLimited = hours.some((r) => r.recommendedHeadway === fleetFloor && fleetFloor > MODEL.minHeadway && r.need > r.carried)
  const curHeadways = hours.map((r) => r.currentHeadway).filter((x): x is number => x != null)

  return {
    ctx,
    service: sid,
    hours,
    bands,
    summary: {
      peakLoad: peak.load,
      peakHour: peak.hour,
      peakLink: peak.link,
      extraTripsPerDirection: Math.round(extra),
      lastTrain: lastRec ? lastRec.hour + 1 : null,
      currentLastTrain: lastCur ? lastCur.hour + 1 : 23,
      peakTrainsNeeded,
      fleet,
      fleetFloor,
      fleetLimited,
      peakTrainsNow: Math.max(0, ...hours.map((r) => r.trainsNow)),
      shortTurn,
      leftBehindCurrent: Math.round(leftBehindCurrent + backlogCurrent),
      currentBestHeadway: curHeadways.length ? Math.min(...curHeadways) : null,
      currentWorstHeadway: curHeadways.length ? Math.max(...curHeadways) : null,
      peakOverflow: Math.max(0, ...hours.map((r) => r.overflow)),
    },
  }
}

function toBands(rows: HourRow[]): Band[] {
  const bands: Band[] = []
  for (const r of rows) {
    const last = bands[bands.length - 1]
    if (last && last.to === r.hour && last.currentHeadway === r.currentHeadway && last.recommendedHeadway === r.recommendedHeadway) {
      last.to = r.hour + 1
      if (r.load > last.peakLoad) last.link = r.link
      last.peakLoad = Math.max(last.peakLoad, r.load)
      last.peakNeed = Math.max(last.peakNeed, r.need)
      last.currentCapacity = Math.min(last.currentCapacity, r.currentCapacity)
      last.recommendedCapacity = Math.min(last.recommendedCapacity, r.recommendedCapacity)
      last.drivers = [...new Set([...last.drivers, ...r.drivers])]
    } else {
      bands.push({
        from: r.hour,
        to: r.hour + 1,
        currentHeadway: r.currentHeadway,
        recommendedHeadway: r.recommendedHeadway,
        peakLoad: r.load,
        peakNeed: r.need,
        link: r.link,
        currentCapacity: r.currentCapacity,
        recommendedCapacity: r.recommendedCapacity,
        drivers: [...r.drivers],
        change: 'same',
      })
    }
  }
  for (const b of bands) {
    if (b.currentHeadway == null && b.recommendedHeadway != null) b.change = b.from >= 20 ? 'extend' : 'start-early'
    else if (b.currentHeadway != null && b.recommendedHeadway != null)
      b.change = b.recommendedHeadway < b.currentHeadway ? 'more' : b.recommendedHeadway > b.currentHeadway ? 'fewer' : 'same'
  }
  return bands
}
