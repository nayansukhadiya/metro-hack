import { useState } from 'react'
import { BRTS, BRTS_PATHS, BRTS_STOPS, METRO_LINKS, metroName, type Relief } from './brts'
import { fmtHour } from './engine'
import { LINE, STATIONS } from './network'

const NAVY = 'var(--brts-line)'

// label placement like the printed map: left of the main vertical corridors, tilted above stops on busy rows
const rowCount: Record<number, number> = {}
for (const s of BRTS_STOPS) rowCount[s.y] = (rowCount[s.y] ?? 0) + 1
const leftColumn = ({ x, y }: { x: number; y: number }) =>
  (x === 374 && y > 383) || (x === 517 && y <= 330) || (x === 857 && y > 300 && y < 500) || (x === 789 && y > 760) || (x === 676 && y > 760)
function labelAt(s: { x: number; y: number }) {
  if (leftColumn(s)) return { x: s.x - 13, y: s.y + 4, anchor: 'end' as const, rotate: 0 }
  if ((rowCount[s.y] ?? 0) >= 3 && s.x !== 453) return { x: s.x + 4, y: s.y - 12, anchor: 'start' as const, rotate: -40 }
  return { x: s.x + 13, y: s.y + 4, anchor: 'start' as const, rotate: 0 }
}
const ORANGE = '#e8710a'

export default function BrtsMap({ hour, relief }: { hour: number; relief: Relief[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const active = relief.filter((r) => hour >= r.from && hour < r.to)
  const onRoute = new Set(active.flatMap((r) => r.route))
  const linked = new Map(METRO_LINKS.map((l) => [l.brts, l]))
  const labelled = (id: string) => BRTS[id].interchange || linked.has(id) || onRoute.has(id) || selected === id
  const sel = selected ? BRTS[selected] : null

  return (
    <div className="brts">
      {active.length > 0 ? (
        <p className="note">
          {fmtHour(hour)}: {active.length} Janmarg relief route{active.length > 1 ? 's' : ''} active (orange), {active.reduce((a, r) => a + r.buses, 0)} extra
          buses/hour.
        </p>
      ) : (
        <p className="note">No metro overflow at {fmtHour(hour)}: Janmarg runs its normal service. Coloured rings mark stops a short walk from a metro station.</p>
      )}
      <div className="mapscroll">
        <svg viewBox="-130 -40 1330 970" role="img" aria-label="Janmarg BRTS network with metro connections" className="brtssvg">
          {BRTS_PATHS.map((p, i) => (
            <polyline
              key={i}
              points={p.stops.map((s) => `${BRTS[s].x},${BRTS[s].y}`).join(' ')}
              style={{ stroke: NAVY }}
              strokeWidth={4}
              strokeDasharray={p.ext ? '6 6' : undefined}
              fill="none"
              strokeLinejoin="round"
              opacity={active.length ? 0.35 : 0.9}
            />
          ))}
          {active.map((r, i) => (
            <polyline
              key={`r${i}`}
              points={r.route.map((s) => `${BRTS[s].x},${BRTS[s].y}`).join(' ')}
              stroke={ORANGE}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.85}
            >
              <title>{`Relief: ${metroName(r.metroFrom)} → ${metroName(r.metroTo)}, ${r.buses} extra buses/hour`}</title>
            </polyline>
          ))}
          {BRTS_STOPS.map((s) => {
            const link = linked.get(s.id)
            const color = link ? LINE[STATIONS[link.metro].lines[0]].color : null
            return (
              <g
                key={s.id}
                className="bstop"
                role="button"
                tabIndex={0}
                aria-label={s.name}
                onClick={() => setSelected(s.id === selected ? null : s.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(s.id === selected ? null : s.id)}
              >
                <title>{s.name}</title>
                <circle cx={s.x} cy={s.y} r={13} fill="transparent" />
                {color && <circle cx={s.x} cy={s.y} r={11} fill="none" stroke={color} strokeWidth={3.5} />}
                {s.interchange ? (
                  <rect x={s.x - 8} y={s.y - 8} width={16} height={16} rx={2} fill="#4f7cc4" stroke={ORANGE} strokeWidth={3} />
                ) : (
                  <circle cx={s.x} cy={s.y} r={6.5} fill={onRoute.has(s.id) ? ORANGE : '#4f7cc4'} style={{ stroke: NAVY }} strokeWidth={1.5} />
                )}
                {labelled(s.id) && (
                  <text
                    {...(() => {
                      const l = labelAt(s)
                      return { x: l.x, y: l.y, textAnchor: l.anchor, transform: l.rotate ? `rotate(${l.rotate} ${l.x} ${l.y})` : undefined }
                    })()}
                    className="blabel"
                  >
                    {s.name}
                    {link ? ` · M ${metroName(link.metro)}` : ''}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      {sel && (
        <div className="stnpanel">
          <button className="close" aria-label="Close" onClick={() => setSelected(null)}>
            ×
          </button>
          <div className="stninfo">
            <strong>{sel.name}</strong>
            <span className="muted">Janmarg BRTS{sel.interchange ? ' · interchange stop' : ''}</span>
            {METRO_LINKS.filter((l) => l.brts === sel.id).map((l) => (
              <p key={l.metro}>
                Walk to metro <strong>{metroName(l.metro)}</strong> ({LINE[STATIONS[l.metro].lines[0]].name}) ·{' '}
                <span className={`tag ${l.source === 'same name' ? 'verified' : 'assumed'}`}>{l.source}</span>
              </p>
            ))}
            {active
              .filter((r) => r.route.includes(sel.id))
              .map((r) => (
                <p key={r.from}>
                  On relief route {metroName(r.metroFrom)} → {metroName(r.metroTo)}: +{r.buses} buses/hour
                </p>
              ))}
          </div>
        </div>
      )}
      <div className="legend">
        <span>
          <i className="sw" style={{ background: NAVY }} /> Janmarg route
        </span>
        <span>
          <i className="sw dashed" /> planned extension
        </span>
        <span>
          <i className="sw" style={{ background: ORANGE }} /> relief route this hour
        </span>
        <span>◎ coloured ring = metro station nearby (colour = metro line)</span>
      </div>
    </div>
  )
}
