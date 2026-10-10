import { useState } from 'react'
import { fmtHour, type Plan } from '../engine'
import { linkLabel } from '../justify'
import { n } from '../mapUtil'

const compact = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(v))

/** Clean tick step for a max value: 1, 2 or 5 × 10^k, about four ticks. */
function niceStep(max: number) {
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
}

/** Demand on the busiest stretch vs what today's and the recommended trains carry, hour by hour. */
export default function DemandChart({ plan }: { plan: Plan }) {
  const rows = plan.hours.filter((r) => r.hour >= 6)
  const [hover, setHover] = useState<number | null>(null)
  const W = 760,
    H = 280,
    L = 52,
    R = 12,
    T = 14,
    B = 40
  const peak = Math.max(...rows.map((r) => Math.max(r.load, r.currentCapacity, r.recommendedCapacity)), 1000)
  const step = niceStep(peak)
  const max = Math.ceil(peak / step) * step
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step)
  const slot = (W - L - R) / rows.length
  const bw = Math.min(24, slot - 6)
  const x = (i: number) => L + i * slot
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const base = y(0)
  const stepPath = (key: 'currentCapacity' | 'recommendedCapacity') =>
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[key])} L${x(i + 1)} ${y(r[key])}`).join(' ')
  // overload periods: hours where demand exceeds what today's timetable carries
  const over = rows.map((r) => r.load > r.currentCapacity)
  const hv = hover != null ? rows[hover] : null

  return (
    <div className="dchart">
      <div className="legend">
        <span>
          <i className="sw vz-demand" /> Demand, busiest stretch
        </span>
        <span>
          <i className="sw vz-over" /> Demand above today’s capacity
        </span>
        <span>
          <i className="sw line vz-today" /> Today’s capacity
        </span>
        <span>
          <i className="sw line vz-plan" /> Recommended capacity
        </span>
        <span>
          <i className="sw vz-band" /> Overload period
        </span>
      </div>
      <div className="dchart-plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Passengers per hour on the busiest stretch against today’s and recommended capacity">
          {rows.map((r, i) => (over[i] ? <rect key={`o${r.hour}`} x={x(i)} y={T} width={slot} height={base - T} className="vz-band" /> : null))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="vz-grid" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" className="vz-tick">
                {compact(t)}
              </text>
            </g>
          ))}
          <text x={14} y={T + (H - T - B) / 2} transform={`rotate(-90 14 ${T + (H - T - B) / 2})`} textAnchor="middle" className="vz-axis">
            passengers / hour
          </text>
          {rows.map((r, i) => {
            const h = Math.max(0, base - y(r.load))
            const cx = x(i) + slot / 2
            const rad = Math.min(4, h)
            return (
              <g key={r.hour}>
                {h > 0 && (
                  <path
                    d={`M${cx - bw / 2},${base} V${base - h + rad} Q${cx - bw / 2},${base - h} ${cx - bw / 2 + rad},${base - h} H${cx + bw / 2 - rad} Q${cx + bw / 2},${base - h} ${cx + bw / 2},${base - h + rad} V${base} Z`}
                    className={over[i] ? 'vz-over' : 'vz-demand'}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
                {i % 2 === 0 && (
                  <text x={cx} y={H - B + 18} textAnchor="middle" className="vz-tick">
                    {fmtHour(r.hour).slice(0, 2)}
                  </text>
                )}
              </g>
            )
          })}
          <text x={L + (W - L - R) / 2} y={H - 4} textAnchor="middle" className="vz-axis">
            hour of day
          </text>
          <path d={stepPath('currentCapacity')} className="vz-line vz-today" />
          <path d={stepPath('recommendedCapacity')} className="vz-line vz-plan" />
          {rows.map((r, i) => (
            <rect
              key={`h${r.hour}`}
              x={x(i)}
              y={T}
              width={slot}
              height={base - T}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${fmtHour(r.hour)}: demand ${n(r.load)} per hour, today ${n(r.currentCapacity)}, recommended ${n(r.recommendedCapacity)}`}
            />
          ))}
        </svg>
        {hv && hover != null && (
          <div className="vz-tip" style={{ left: `${((x(hover) + slot / 2) / W) * 100}%` }} role="status">
            <strong>
              {fmtHour(hv.hour)}–{fmtHour(hv.hour + 1)}
            </strong>
            <span>{linkLabel(hv.link)}</span>
            <dl>
              <dt>
                <i className={`sw ${over[hover] ? 'vz-over' : 'vz-demand'}`} /> Demand
              </dt>
              <dd>{n(hv.load)}/h</dd>
              <dt>
                <i className="sw line vz-today" /> Today
              </dt>
              <dd>
                {n(hv.currentCapacity)}/h{hv.currentHeadway ? ` · every ${hv.currentHeadway} min` : ' · no train'}
              </dd>
              <dt>
                <i className="sw line vz-plan" /> Plan
              </dt>
              <dd>
                {n(hv.recommendedCapacity)}/h{hv.recommendedHeadway ? ` · every ${hv.recommendedHeadway} min` : ''}
              </dd>
              {hv.overflow > 0 && (
                <>
                  <dt>Overflow</dt>
                  <dd>{n(hv.overflow)}/h → Janmarg</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
