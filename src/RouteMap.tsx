import { useMemo, useState } from 'react'
import { fmtHour, type DayContext } from './engine'
import { GRAPHS, OHC, serviceHour, type ServiceHour } from './flows'
import { LINE, LINES, STATIONS, kindLabel, type LineId, type ServiceId } from './network'

// Layout is generated from network.ts only, shaped like the on-train map:
// Red+Yellow spine on y=0, Blue split above/below at Old High Court, Violet dropping from GNLU.
const STEP = 26
const ROW = 60
const GNLU = 'gnlu'
const FIRST_HOUR = 6
const LAST_HOUR = 25 // 01:00–02:00

type Pt = { x: number; y: number }
type LabelSide = 'up' | 'down'

function layout() {
  const pos: Record<string, Pt> = {}
  const side: Record<string, LabelSide> = {}
  const spine = [...LINE.red.stations, ...LINE.yellow.stations.slice(1)]
  const ohcIndex = spine.findIndex((s) => s.id === OHC)
  spine.forEach((s, i) => {
    pos[s.id] = { x: i * STEP, y: 0 }
    side[s.id] = i < ohcIndex ? 'down' : 'up' // keep spine labels clear of the Blue rows
  })
  const blue = LINE.blue.stations
  const bi = blue.findIndex((s) => s.id === OHC)
  const ohc = pos[OHC]
  blue.forEach((s, k) => {
    if (k === bi) return
    pos[s.id] = k < bi ? { x: ohc.x - (bi - k) * STEP, y: -ROW } : { x: ohc.x + (k - bi) * STEP, y: ROW }
    side[s.id] = k < bi ? 'up' : 'down'
  })
  const gnlu = pos[GNLU]
  LINE.violet.stations.slice(1).forEach((s, k) => {
    pos[s.id] = { x: gnlu.x + (k + 1) * STEP, y: ROW }
    side[s.id] = 'down'
  })
  // segment geometry per line edge
  const segs = LINES.flatMap((l) =>
    l.stations.slice(1).map((b, i) => {
      const a = l.stations[i]
      const pa = pos[a.id]
      const pb = pos[b.id]
      const pts = pa.y !== pb.y && pa.x === gnlu.x && a.id === GNLU ? [pa, { x: pa.x, y: pb.y }, pb] : [pa, pb]
      return { id: `${l.id}:${a.id}>${b.id}`, line: l.id as LineId, color: l.color, pts }
    }),
  )
  const xs = Object.values(pos).map((p) => p.x)
  const box = { x: Math.min(...xs) - 110, y: -ROW - 95, w: Math.max(...xs) - Math.min(...xs) + 220, h: 2 * ROW + 190 }
  return { pos, side, segs, box }
}

const LAYOUT = layout()

const SERVICE_OF: Record<LineId, ServiceId> = { blue: 'blue', red: 'redYellow', yellow: 'redYellow', violet: 'redYellow' }

// grey → orange → red
function heat(t: number): string {
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

const n = (x: number) => Math.round(x).toLocaleString('en-IN')

export default function RouteMap({ ctx, initialHour }: { ctx: DayContext; initialHour: number }) {
  const [hour, setHour] = useState(Math.min(LAST_HOUR, Math.max(FIRST_HOUR, initialHour)))
  const [selected, setSelected] = useState<string | null>(null)

  const day = useMemo(() => {
    const hours: Record<number, Record<ServiceId, ServiceHour>> = {}
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
  }, [ctx])

  const now = day.hours[hour]
  const boardings = (id: string) => (now.blue.boardings[id] ?? 0) + (now.redYellow.boardings[id] ?? 0)
  const linkLoad = (segId: string, line: LineId) => {
    const sid = SERVICE_OF[line]
    const i = GRAPHS[sid].edges.findIndex((e) => e.id === segId)
    return i < 0 ? 0 : Math.max(...now[sid].links[i])
  }
  const { pos, side, segs, box } = LAYOUT

  return (
    <div className="routemap">
      <div className="row">
        <h3>Network map</h3>
        <label className="slider">
          <span>
            {fmtHour(hour)}–{fmtHour(hour + 1)}
          </span>
          <input
            type="range"
            min={FIRST_HOUR}
            max={LAST_HOUR}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            aria-label="Hour of day"
          />
        </label>
      </div>
      <div className="mapscroll">
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label="Ahmedabad Metro route map coloured by load">
          {segs.map((s) => {
            const load = linkLoad(s.id, s.line)
            return (
              <polyline
                key={s.id}
                points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                stroke={s.color}
                strokeWidth={2.5 + (9 * load) / day.maxL}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              >
                <title>{`${s.id.split(':')[1].split('>').map((id) => STATIONS[id].name).join(' – ')}: ${n(load)} passengers/h (busier direction)`}</title>
              </polyline>
            )
          })}
          {Object.entries(pos).map(([id, p]) => {
            const st = STATIONS[id]
            const b = boardings(id)
            const up = side[id] === 'up'
            return (
              <g
                key={id}
                className={`stn ${selected === id ? 'sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${st.name}: ${n(b)} boardings`}
                onClick={() => setSelected(id === selected ? null : id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(id === selected ? null : id)}
              >
                <circle cx={p.x} cy={p.y} r={11} fill="transparent" />
                {st.closed ? (
                  <circle cx={p.x} cy={p.y} r={4} className="closed" />
                ) : st.interchange ? (
                  <circle cx={p.x} cy={p.y} r={7} fill={heat(b / day.maxB)} className="ring" />
                ) : (
                  <circle cx={p.x} cy={p.y} r={4.5} fill={heat(b / day.maxB)} className="dot" />
                )}
                <text
                  x={p.x + (up ? 6 : -6)}
                  y={p.y + (up ? -9 : 14)}
                  textAnchor={up ? 'start' : 'end'}
                  transform={`rotate(-35 ${p.x + (up ? 6 : -6)} ${p.y + (up ? -9 : 14)})`}
                  className={`stnlabel ${st.closed ? 'muted' : ''}`}
                >
                  {st.name}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="legend">
        {LINES.map((l) => (
          <span key={l.id}>
            <i className="sw" style={{ background: l.color }} /> {l.name.split(' (')[0]}
          </span>
        ))}
        <span>
          <i className="sw heat" /> boardings this hour, low → high
        </span>
        <span>Line width = passengers on that link</span>
        <span>◯ closed (Sabarmati Rly Stn)</span>
      </div>
      {selected && <StationPanel id={selected} now={now} onClose={() => setSelected(null)} />}
    </div>
  )
}

function StationPanel({ id, now, onClose }: { id: string; now: Record<ServiceId, ServiceHour>; onClose: () => void }) {
  const st = STATIONS[id]
  const services = [...new Set(st.lines.map((l) => SERVICE_OF[l]))]
  const b = services.reduce((a, s) => a + (now[s].boardings[id] ?? 0), 0)
  const kind = kindLabel(id)
  const drivers = [
    ...(kind ? [kind] : []),
    ...services.flatMap((s) => now[s].stationDrivers[id] ?? []),
    ...services.flatMap((s) => now[s].drivers.filter((d) => d.startsWith('office') || d.includes('holiday') || d.includes('rain'))),
  ]
  return (
    <div className="stnpanel">
      <div className="row">
        <strong>{st.name}</strong>
        <button aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="chips">
        {st.lines.map((l) => (
          <span key={l} className="chip" style={{ borderColor: LINE[l].color }}>
            <i className="sw" style={{ background: LINE[l].color }} /> {LINE[l].name}
          </span>
        ))}
        {st.closed && <span className="chip">Closed: work in progress</span>}
      </div>
      <p>
        <strong>{st.closed ? '—' : n(b)}</strong> boardings, {fmtHour(now.blue.hour)}–{fmtHour(now.blue.hour + 1)}
      </p>
      {drivers.length > 0 && (
        <ul>
          {[...new Set(drivers)].map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
