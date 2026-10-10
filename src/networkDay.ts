import type { DayContext } from './engine'
import { serviceHour } from './flows'
import { FIRST_HOUR, LAST_HOUR, type HourData, type NetworkDay } from './mapUtil'

/** Boardings and link loads for every hour on both services (computed once per day). */
export function networkDay(ctx: DayContext): NetworkDay {
  const hours: Record<number, HourData> = {}
  let maxB = 1
  let maxL = 1
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
    const blue = serviceHour(ctx, 'blue', h)
    const redYellow = serviceHour(ctx, 'redYellow', h)
    hours[h] = { blue, redYellow }
    for (const sh of [blue, redYellow]) {
      for (const v of Object.values(sh.boardings)) maxB = Math.max(maxB, v)
      for (const [f, r] of sh.links) maxL = Math.max(maxL, f, r)
    }
  }
  return { hours, maxB, maxL }
}
