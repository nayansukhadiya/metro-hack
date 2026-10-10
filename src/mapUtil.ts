import type { ServiceHour } from './flows'
import type { LineId, ServiceId } from './network'
import geo from './stations-geo.json'

/** Station coordinates are bundled (scripts/fetch-stations.ts); the real map needs them. */
export const HAS_GEO = geo.length >= 2

export type HourData = Record<ServiceId, ServiceHour>

export const SERVICE_OF: Record<LineId, ServiceId> = { blue: 'blue', red: 'redYellow', yellow: 'redYellow', violet: 'redYellow' }

export const n = (x: number) => Math.round(x).toLocaleString('en-IN')

/** grey → orange → red */
export function heat(t: number): string {
  const stops = [
    [154, 160, 166],
    [251, 140, 0],
    [211, 47, 47],
  ]
  const x = Math.max(0, Math.min(1, t)) * 2
  const i = Math.min(1, Math.floor(x))
  const f = x - i
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))
  return `rgb(${c.join(',')})`
}

export const boardingsAt = (now: HourData, id: string) => (now.blue.boardings[id] ?? 0) + (now.redYellow.boardings[id] ?? 0)

export const FIRST_HOUR = 6
export const LAST_HOUR = 25 // 01:00–02:00

/** Boardings and link loads for every hour of the day on both services, plus the day's maxima for scaling. */
export interface NetworkDay {
  hours: Record<number, HourData>
  maxB: number
  maxL: number
}
