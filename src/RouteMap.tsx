import { Maximize2, Minus, Pause, Play, Plus } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import type { Relief } from './brts'
import { fmtHour } from './engine'
import { GRAPHS, OHC } from './flows'
import { FIRST_HOUR, HAS_GEO, LAST_HOUR, SERVICE_OF, boardingsAt, heat, n, type NetworkDay } from './mapUtil'
import { LINE, LINES, STATIONS, type LineId } from './network'

const GeoMap = lazy(() => import('./GeoMap'))
const BrtsMap = lazy(() => import('./BrtsMap'))

// Layout is generated from network.ts only, shaped like the on-train map:
// Red+Yellow spine on y=0, Blue split above/below at Old High Court, Violet dropping from GNLU.
const STEP = 28
const ROW = 66
const GNLU = 'gnlu'

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
  // room for rotated labels; the top also holds Janmarg relief badges above the label zone
  const box = { x: Math.min(...xs) - 95, y: -ROW - 115, w: Math.max(...xs) - Math.min(...xs) + 205, h: 2 * ROW + 200 }
  return { pos, side, segs, box }
}

const LAYOUT = layout()

const ZOOMS = [1, 1.5, 2, 3]

export default function RouteMap({
  day,
  hour,
  onHour,
  selected,
  onSelect,
  relief,
}: {
  day: NetworkDay
  hour: number
  onHour: (h: number) => void
  selected: string | null
  onSelect: (id: string | null) => void
  relief: Relief[]
}) {
  const [view, setView] = useState<'map' | 'schematic' | 'brts'>(HAS_GEO ? 'map' : 'schematic')
  const [offline, setOffline] = useState(false)
  const [focus, setFocus] = useState<LineId | 'all'>('all')
  const [zoom, setZoom] = useState(1)
  const [playing, setPlaying] = useState(false)
  const showMap = view === 'map' && HAS_GEO && !offline

  // play the day hour by hour
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => onHour(hour >= LAST_HOUR ? FIRST_HOUR : hour + 1), 1100)
    return () => clearInterval(t)
  }, [playing, hour, onHour])

  const now = day.hours[hour]
  const linkLoad = (segId: string, line: LineId) => {
    const sid = SERVICE_OF[line]
    const i = GRAPHS[sid].edges.findIndex((e) => e.id === segId)
    return i < 0 ? 0 : Math.max(...now[sid].links[i])
  }
  const { pos, side, segs, box } = LAYOUT
  const dim = (lines: LineId[]) => focus !== 'all' && !lines.includes(focus)
  const activeRelief = relief.filter((r) => hour >= r.from && hour < r.to)

  return (
    <div className="routemap">
      <div className="maptools">
        <div className="seg" role="group" aria-label="Map view">
          <button className={showMap ? 'on' : ''} aria-pressed={showMap} onClick={() => setView('map')}>
            Map view
          </button>
          <button
            className={view === 'schematic' || (view === 'map' && !showMap) ? 'on' : ''}
            aria-pressed={view === 'schematic'}
            onClick={() => setView('schematic')}
          >
            Schematic
          </button>
          <button className={view === 'brts' ? 'on' : ''} aria-pressed={view === 'brts'} onClick={() => setView('brts')}>
            Janmarg BRTS{relief.length ? <span className="tcount">{relief.length}</span> : null}
          </button>
        </div>
        <div className="hourctl">
          <button
            className="iconbtn bordered"
            aria-label={playing ? 'Pause the day' : 'Play the day hour by hour'}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <output className="hourlabel">
            {fmtHour(hour)}–{fmtHour(hour + 1)}
          </output>
          <input
            type="range"
            min={FIRST_HOUR}
            max={LAST_HOUR}
            value={hour}
            onChange={(e) => {
              setPlaying(false)
              onHour(Number(e.target.value))
            }}
            aria-label="Hour of day"
          />
        </div>
      </div>

      {view !== 'brts' && (
        <div className="linefilter" role="group" aria-label="Highlight a line">
          <button className={focus === 'all' ? 'on' : ''} aria-pressed={focus === 'all'} onClick={() => setFocus('all')}>
            All lines
          </button>
          {LINES.map((l) => (
            <button key={l.id} className={focus === l.id ? 'on' : ''} aria-pressed={focus === l.id} onClick={() => setFocus(focus === l.id ? 'all' : l.id)}>
              <i className="sw" style={{ background: l.color }} /> {l.name.split(' (')[0]}
            </button>
          ))}
          {activeRelief.length > 0 && (
            <span className="reliefkey">
              <i className="sw brtsdash" /> Janmarg relief
            </span>
          )}
        </div>
      )}

      {view === 'map' && !showMap && (
        <p className="note">{offline ? 'Map offline, showing schematic.' : 'No station coordinates bundled yet (run scripts/fetch-stations.ts), showing schematic.'}</p>
      )}

      {view === 'brts' ? (
        <Suspense fallback={<p className="note">Loading Janmarg…</p>}>
          <BrtsMap hour={hour} relief={relief} />
        </Suspense>
      ) : showMap ? (
        <Suspense fallback={<p className="note">Loading map…</p>}>
          <GeoMap now={now} maxB={day.maxB} onOffline={() => setOffline(true)} />
        </Suspense>
      ) : (
        <div className="schematic">
          <div className="zoomctl" role="group" aria-label="Zoom">
            <button className="iconbtn" aria-label="Zoom in" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)])}>
              <Plus size={15} />
            </button>
            <button className="iconbtn" aria-label="Zoom out" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)])}>
              <Minus size={15} />
            </button>
            <button className="iconbtn" aria-label="Fit to width" onClick={() => setZoom(1)}>
              <Maximize2 size={14} />
            </button>
          </div>
          <div className="mapscroll">
            <svg
              viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
              style={{ width: `${zoom * 100}%`, minWidth: `${Math.round(820 * zoom)}px` }}
              role="img"
              aria-label="Ahmedabad Metro schematic coloured by load"
            >
              {segs.map((s) => {
                const load = linkLoad(s.id, s.line)
                return (
                  <polyline
                    key={s.id}
                    points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    stroke={s.color}
                    strokeWidth={3 + (10 * load) / day.maxL}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                    opacity={dim([s.line]) ? 0.15 : 1}
                  >
                    <title>{`${s.id
                      .split(':')[1]
                      .split('>')
                      .map((id) => STATIONS[id].name)
                      .join(' – ')}: ${n(load)} passengers/h (busier direction)`}</title>
                  </polyline>
                )
              })}
              {activeRelief.map((r, i) => {
                const a = pos[r.metroFrom]
                const b = pos[r.metroTo]
                if (!a || !b) return null
                // arc peaks above the station labels; each badge gets its own height
                const lift = 250 + i * 56
                const mx = (a.x + b.x) / 2
                const my = Math.min(a.y, b.y) - lift
                return (
                  <g key={`r${i}`} className="reliefarc">
                    <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} />
                    <g transform={`translate(${mx},${(a.y + 2 * my + b.y) / 4})`}>
                      <rect x={-64} y={-11} width={128} height={20} rx={10} />
                      <text textAnchor="middle" y={4}>
                        +{r.buses} buses/h · Janmarg
                      </text>
                    </g>
                  </g>
                )
              })}
              {Object.entries(pos).map(([id, p]) => {
                const st = STATIONS[id]
                const b = boardingsAt(now, id)
                const up = side[id] === 'up'
                const lx = p.x + (up ? 7 : -7)
                const ly = p.y + (up ? -10 : 16)
                const faded = dim(st.lines)
                return (
                  <g
                    key={id}
                    className={`stn ${selected === id ? 'sel' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${st.name}: ${n(b)} boardings`}
                    aria-pressed={selected === id}
                    onClick={() => onSelect(id === selected ? null : id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(id === selected ? null : id)}
                    opacity={faded ? 0.25 : 1}
                  >
                    <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
                    {selected === id && <circle cx={p.x} cy={p.y} r={11} className="selring" />}
                    {st.closed ? (
                      <circle cx={p.x} cy={p.y} r={4.5} className="closed" />
                    ) : st.interchange ? (
                      <circle cx={p.x} cy={p.y} r={7.5} fill={heat(b / day.maxB)} className="ring" />
                    ) : (
                      <circle cx={p.x} cy={p.y} r={5} fill={heat(b / day.maxB)} className="dot" />
                    )}
                    <text
                      x={lx}
                      y={ly}
                      textAnchor={up ? 'start' : 'end'}
                      transform={`rotate(-35 ${lx} ${ly})`}
                      className={`stnlabel ${st.closed ? 'muted' : ''}`}
                    >
                      {st.name}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}

      {view !== 'brts' && (
        <div className="legend">
          <span>
            <i className="sw heat" /> boardings this hour, low → high
          </span>
          {!showMap && <span>line width = passengers on that stretch</span>}
          <span>
            <i className="sw ringsw" /> interchange
          </span>
          <span>◯ closed (Sabarmati Rly Stn)</span>
        </div>
      )}
    </div>
  )
}
