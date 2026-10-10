import { CALENDAR, CURRENT_HEADWAY, MODEL, type CalendarDay, type CityEvent } from './data'
import { lineDemand } from './flows'

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
  backlog: number // still waiting at end of hour
  currentHeadway: number | null
  recommendedHeadway: number | null
  currentCapacity: number
  recommendedCapacity: number
  crush: boolean
  drivers: string[]
}

export interface Band {
  from: number
  to: number
  currentHeadway: number | null
  recommendedHeadway: number | null
  peakLoad: number
  currentCapacity: number
  recommendedCapacity: number
  drivers: string[]
  change: 'more' | 'fewer' | 'same' | 'extend' | 'start-early'
}

export interface Plan {
  ctx: DayContext
  hours: HourRow[]
  bands: Band[]
  summary: {
    peakLoad: number
    peakHour: number
    extraTripsPerDirection: number
    lastTrain: number | null
    currentLastTrain: number
    peakTrainsNeeded: number
    shortTurn: boolean
    leftBehindCurrent: number
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

export function computePlan(ctx: DayContext): Plan {
  const { holiday, lowTravel, festivalNight, workingDay, rainy } = dayModel(ctx)
  // hourly shape and reasons come from the generators on Red+Yellow (APMC ⇄ Mahatma Mandir)
  const demand = lineDemand(ctx, 'redYellow')
  const linkFactor = MODEL.peakDirectionShare * MODEL.busiestLinkShare

  // the timetable that would run today (holidays run the Sunday pattern)
  const pattern = workingDay ? ctx.dayType : 'sunday'
  const current = CURRENT_HEADWAY[pattern === 'weekday' || pattern === 'saturday' ? pattern : 'sunday']

  const hours: HourRow[] = []
  let backlog = 0
  let backlogCurrent = 0
  let leftBehindCurrent = 0

  for (let h = 5; h <= 26; h++) {
    const drivers: string[] = []
    let load = demand[h].journeys * linkFactor
    let crush = false

    drivers.push(...demand[h].drivers)
    if (holiday) drivers.push(`${holiday.name} holiday: no commute peak`)
    if (lowTravel) drivers.push(`${lowTravel.name}: very low travel`)
    if (rainy && load > 0) drivers.push(`heavy rain forecast (${ctx.rainMm} mm)`)

    for (const e of ctx.events) {
      if (e.type === 'exam') {
        if (h >= 7 && h < 9) {
          load += e.attendance * 0.4 * 0.5
          drivers.push(`${e.name}: students travelling in`)
        }
        if (h >= 13 && h < 15) {
          load += e.attendance * 0.4 * 0.5
          drivers.push(`${e.name}: students returning`)
        }
      }
      if (e.type === 'stadium') {
        const fans = e.attendance * MODEL.stadiumMetroShare
        const startH = Math.floor(e.start)
        const inflow: Record<number, number> = { [startH - 4]: 0.15, [startH - 3]: 0.25, [startH - 2]: 0.35, [startH - 1]: 0.25 }
        if (inflow[h]) {
          load += fans * inflow[h] * 0.85
          drivers.push(`${e.name}: fans arriving at Motera`)
        }
        const endH = Math.floor(e.end)
        const egress: Record<number, number> = { [endH]: 0.6, [endH + 1]: 0.3, [endH + 2]: 0.1 }
        if (egress[h]) {
          load += fans * egress[h] * MODEL.stadiumEgressToApmcSide
          crush = true
          drivers.push(`${e.name}: crowd leaving Motera`)
        }
      }
    }

    if (festivalNight) {
      const g = festivalJourneys(ctx, festivalNight.name)
      const out: Record<number, number> = { 19: 0.3, 20: 0.5, 21: 0.2 }
      const back: Record<number, number> = { 23: 0.35, 24: 0.45, 25: 0.2 }
      if (out[h]) {
        load += g * out[h] * 0.4
        drivers.push(`${festivalNight.name}: people heading out`)
      }
      if (back[h]) {
        load += g * back[h] * 0.4
        drivers.push(`${festivalNight.name}: late return wave`)
      }
    }

    // recommended service
    const cap = crush || ctx.events.some((e) => e.type === 'stadium' && h >= Math.floor(e.start) - 4 && h < Math.floor(e.start))
      ? MODEL.trainCapacityCrush
      : MODEL.trainCapacityComfort
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
      if (recH < MODEL.minHeadway) recH = MODEL.minHeadway
      // only thin out service when trains would be under 60% full
      const cur = current(h)
      if (inService && cur != null && recH > cur && need > 0.6 * (60 / cur) * cap) recH = cur
    }
    const recCap = recH ? (60 / recH) * cap : 0
    backlog = recH ? Math.max(0, need - recCap) : 0 // no train: riders choose another mode

    const curH = h <= 23 ? current(h) : null
    const curCap = curH ? (60 / curH) * cap : 0
    const needCur = load + backlogCurrent
    backlogCurrent = Math.max(0, needCur - curCap)
    if (!curH) {
      leftBehindCurrent += backlogCurrent
      backlogCurrent = 0
    }

    if (backlog > 0 && recH === MODEL.minHeadway) drivers.push('demand above the 5-minute limit: queue carries over')
    hours.push({
      hour: h,
      load: Math.round(load),
      backlog: Math.round(backlog),
      currentHeadway: curH,
      recommendedHeadway: recH,
      currentCapacity: Math.round(curCap),
      recommendedCapacity: Math.round(recCap),
      crush,
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
  const minH = Math.min(...hours.map((r) => r.recommendedHeadway ?? 99))
  const fullTrains = Math.ceil(MODEL.cycleFullMin / minH)
  const shortTurn = fullTrains > MODEL.corridorFleet
  const peakTrainsNeeded = shortTurn ? Math.ceil(MODEL.cycleShortTurnMin / minH) : fullTrains

  return {
    ctx,
    hours,
    bands,
    summary: {
      peakLoad: peak.load,
      peakHour: peak.hour,
      extraTripsPerDirection: Math.round(extra),
      lastTrain: lastRec ? lastRec.hour + 1 : null,
      currentLastTrain: lastCur ? lastCur.hour + 1 : 23,
      peakTrainsNeeded,
      shortTurn,
      leftBehindCurrent: Math.round(leftBehindCurrent + backlogCurrent),
    },
  }
}

function toBands(rows: HourRow[]): Band[] {
  const bands: Band[] = []
  for (const r of rows) {
    const last = bands[bands.length - 1]
    if (last && last.to === r.hour && last.currentHeadway === r.currentHeadway && last.recommendedHeadway === r.recommendedHeadway) {
      last.to = r.hour + 1
      last.peakLoad = Math.max(last.peakLoad, r.load)
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
