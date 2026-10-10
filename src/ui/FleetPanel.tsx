import { ArrowLeftRight, Bus, Lightbulb, Minus, Plus, RotateCcw } from 'lucide-react'
import { MODEL } from '../data'
import { fmtHour, trainsFor, type Plan } from '../engine'
import { LINE, OPERATIONS, SERVICES, type ServiceId } from '../network'

const SIDS: ServiceId[] = ['redYellow', 'blue']
const colorOf = (sid: ServiceId) => LINE[SERVICES[sid].lines[0]].color

interface Option {
  text: string
  apply?: { blue: number; redYellow: number }
  icon: typeof Lightbulb
}

/** What the fleet can do: trains needed per hour vs the fleet, and options when a line runs short. */
function options(plans: Record<ServiceId, Plan>, fleets: Record<ServiceId, number>, reliefBuses: number): Option[] {
  const out: Option[] = []
  for (const sid of SIDS) {
    const p = plans[sid]
    if (!p.summary.fleetLimited) continue
    const other: ServiceId = sid === 'blue' ? 'redYellow' : 'blue'
    const tight = p.hours.filter((r) => r.overflow > 0)
    const want = trainsFor(sid, MODEL.minHeadway, 0).trains // trains for 5-minute service (short-turn where possible)
    const deficit = Math.max(0, want - fleets[sid])
    const otherNeed = Math.max(0, ...tight.map((r) => plans[other].hours.find((x) => x.hour === r.hour)?.trainsNeeded ?? 0))
    const spare = Math.max(0, fleets[other] - otherNeed)
    const move = Math.min(deficit, spare)
    const hours = tight.length ? `${fmtHour(tight[0].hour)}–${fmtHour(tight[tight.length - 1].hour + 1)}` : ''
    out.push({
      icon: Lightbulb,
      text: `${SERVICES[sid].name} is fleet-limited ${hours}: ${fleets[sid]} trainsets allow every ${p.summary.fleetFloor} min at best${OPERATIONS[sid].shortTurn ? ` (short-turn ${OPERATIONS[sid].shortTurn})` : ''}. Every ${MODEL.minHeadway} min needs ${want}.`,
    })
    if (move > 0)
      out.push({
        icon: ArrowLeftRight,
        text: `Move ${move} trainset${move > 1 ? 's' : ''} from ${SERVICES[other].name}: it needs at most ${otherNeed} of ${fleets[other]} in those hours.`,
        apply: { ...fleets, [sid]: fleets[sid] + move, [other]: fleets[other] - move },
      })
    else out.push({ icon: ArrowLeftRight, text: `${SERVICES[other].name} has no spare trainsets in those hours (needs ${otherNeed} of ${fleets[other]}).` })
    if (reliefBuses > 0) out.push({ icon: Bus, text: `Meanwhile Janmarg relief carries part of the overflow (+${reliefBuses} buses/hour at the worst hour).` })
  }
  for (const sid of SIDS) {
    const p = plans[sid]
    if (p.summary.fleetLimited || p.summary.peakOverflow <= 0) continue
    out.push({
      icon: Bus,
      text: `${SERVICES[sid].name} already runs every ${p.summary.fleetFloor} min at its busiest, the shortest possible; ${p.summary.peakOverflow.toLocaleString('en-IN')} passengers/hour still overflow, so Janmarg relief adds +${reliefBuses} buses/hour.`,
    })
  }
  if (!out.length) {
    const spare = SIDS.map((sid) => `${SERVICES[sid].name} ${Math.max(0, fleets[sid] - plans[sid].summary.peakTrainsNeeded)}`).join(', ')
    out.push({ icon: Lightbulb, text: `Both lines run the plan within their fleets. Spare trainsets at the busiest hour: ${spare}. Use them for standby or maintenance.` })
  }
  return out
}

function FleetChart({ plan, sid, fleet }: { plan: Plan; sid: ServiceId; fleet: number }) {
  const rows = plan.hours.filter((r) => r.hour >= 6)
  const W = 360,
    H = 92,
    L = 22,
    B = 16,
    T = 6
  const max = Math.max(fleet, ...rows.map((r) => Math.max(r.trainsNeeded, r.trainsNow))) * 1.1
  const bw = (W - L - 4) / rows.length
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fleetchart" role="img" aria-label={`${SERVICES[sid].name}: trainsets needed per hour against the fleet of ${fleet}`}>
      <line x1={L} x2={W - 4} y1={y(fleet)} y2={y(fleet)} className="fleetline" />
      <text x={L - 4} y={y(fleet) + 3} textAnchor="end" className="tick">
        {fleet}
      </text>
      {rows.map((r, i) => (
        <g key={r.hour}>
          <rect
            x={L + i * bw + 1.5}
            y={y(r.trainsNeeded)}
            width={bw - 3}
            height={Math.max(0, y(0) - y(r.trainsNeeded))}
            rx={1.5}
            fill={colorOf(sid)}
            opacity={r.overflow > 0 ? 1 : 0.55}
          >
            <title>{`${fmtHour(r.hour)}: plan needs ${r.trainsNeeded}${r.shortTurnHour ? ' (short-turn)' : ''}, today ${r.trainsNow}, fleet ${fleet}`}</title>
          </rect>
          {r.trainsNow > 0 && <line x1={L + i * bw + 1} x2={L + (i + 1) * bw - 1} y1={y(r.trainsNow)} y2={y(r.trainsNow)} className="nowtick" />}
          {i % 3 === 0 && (
            <text x={L + i * bw + bw / 2} y={H - 3} textAnchor="middle" className="tick">
              {fmtHour(r.hour).slice(0, 2)}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function FleetPanel({
  plans,
  fleets,
  onChange,
  reliefBuses,
}: {
  plans: Record<ServiceId, Plan>
  fleets: Record<ServiceId, number>
  onChange: (f: Record<ServiceId, number>) => void
  reliefBuses: number
}) {
  const changed = SIDS.some((sid) => fleets[sid] !== OPERATIONS[sid].fleet)
  const set = (sid: ServiceId, v: number) => onChange({ ...fleets, [sid]: Math.max(4, Math.min(40, v)) })
  return (
    <div className="fleet">
      <div className="fleetlines">
        {SIDS.map((sid) => {
          const s = plans[sid].summary
          return (
            <div key={sid} className="fleetline-card">
              <div className="row">
                <strong className="linename">
                  {SERVICES[sid].lines.map((l) => (
                    <i key={l} className="dotline" style={{ background: LINE[l].color }} />
                  ))}
                  {SERVICES[sid].name}
                </strong>
                <div className="stepper" role="group" aria-label={`${SERVICES[sid].name} fleet`}>
                  <button className="iconbtn" aria-label="One trainset fewer" onClick={() => set(sid, fleets[sid] - 1)}>
                    <Minus size={14} />
                  </button>
                  <output aria-live="polite">{fleets[sid]}</output>
                  <button className="iconbtn" aria-label="One trainset more" onClick={() => set(sid, fleets[sid] + 1)}>
                    <Plus size={14} />
                  </button>
                  <span className="muted small">trainsets</span>
                </div>
              </div>
              <FleetChart plan={plans[sid]} sid={sid} fleet={fleets[sid]} />
              <p className="muted small">
                Busiest hour needs <strong>{s.peakTrainsNeeded}</strong> (today’s timetable uses {s.peakTrainsNow}). Shortest possible headway with this fleet:{' '}
                <strong>{s.fleetFloor} min</strong>
                {s.shortTurn ? `, short-turn ${OPERATIONS[sid].shortTurn}` : ''}.
              </p>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span>
          <i className="sw" style={{ background: 'var(--muted)' }} /> trainsets the plan needs (solid = metro overflowing)
        </span>
        <span>
          <i className="sw now" /> today’s timetable
        </span>
        <span>
          <i className="sw fleetsw" /> fleet on the line
        </span>
      </div>
      <ul className="options">
        {options(plans, fleets, reliefBuses).map((o, i) => (
          <li key={i}>
            <o.icon size={16} aria-hidden="true" />
            <span>{o.text}</span>
            {o.apply && (
              <button className="primary" onClick={() => onChange(o.apply!)}>
                Apply
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">
        Moving trainsets between Blue and Red+Yellow assumes a depot or track transfer is possible; check with GMRC operations. Fleet sizes are assumptions
        ({OPERATIONS.redYellow.fleet} Red+Yellow, {OPERATIONS.blue.fleet} Blue).
        {changed && (
          <button className="linkbtn" onClick={() => onChange({ blue: OPERATIONS.blue.fleet, redYellow: OPERATIONS.redYellow.fleet })}>
            <RotateCcw size={12} aria-hidden="true" /> reset
          </button>
        )}
      </p>
    </div>
  )
}
