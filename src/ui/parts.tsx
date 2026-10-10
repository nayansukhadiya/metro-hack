import { Bus, Plus, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { BRTS, metroName, type Relief } from '../brts'
import type { CityEvent, EventType } from '../data'
import { fmtHour, type Plan } from '../engine'
import { n } from '../mapUtil'
import { SERVICES, STATIONS, type ServiceId } from '../network'

/** Section card: icon, title, one plain sentence saying what it shows, optional actions on the right. */
export function Card({
  icon: Icon,
  step,
  title,
  sub,
  actions,
  className = '',
  children,
}: {
  icon: LucideIcon
  step?: string
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      <div className="cardhead">
        <span className="cardicon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="cardtitle">
          <h3>
            {step && <span className="step">{step}</span>}
            {title}
          </h3>
          {sub && <p className="cardsub">{sub}</p>}
        </div>
        {actions && <div className="cardactions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function Stat({ icon: Icon, label, value, hint, alert }: { icon: LucideIcon; label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className={`stat ${alert ? 'alert' : ''}`}>
      <span className="label">
        <Icon size={14} aria-hidden="true" /> {label}
      </span>
      <span className="value">{value}</span>
      <span className="hint">{hint}</span>
    </div>
  )
}

export function ReliefCard({ relief, line, floor }: { relief: Relief[]; line: ServiceId; floor: number }) {
  const mine = relief.filter((r) => r.service === line)
  const shown = mine.length ? mine : relief
  const other = relief.length - mine.length
  return (
    <Card
      icon={Bus}
      title="Janmarg BRTS surge relief"
      sub={`In these hours the metro is full even at the shortest headway its fleet allows (${floor} min). Extra Janmarg buses take the overflow between the BRTS stops next to the crowded stretch.`}
      actions={<span className="badge">{relief.length} route{relief.length > 1 ? 's' : ''}</span>}
      className="relief"
    >
      {shown.map((r) => {
        const inter = r.route.filter((id) => BRTS[id].interchange).map((id) => BRTS[id].name)
        const sameHour = relief.filter((x) => x.service === r.service && x.from === r.from)
        const covered = sameHour.reduce((a, x) => a + x.carried, 0)
        return (
          <div key={`${r.service}${r.from}${r.metroTo}`} className="reliefrow">
            <div className="when">
              {fmtHour(r.from)}–{fmtHour(r.to)}
              <small>{SERVICES[r.service].name}</small>
            </div>
            <div>
              <p>
                <strong>+{r.buses} buses/hour</strong> {BRTS[r.route[0]].name} → {BRTS[r.route[r.route.length - 1]].name} ({r.route.length - 1} stops), for metro{' '}
                {metroName(r.metroFrom)} → {metroName(r.metroTo)}. Takes {n(r.carried)} of the {n(r.overflow)} passengers/hour the metro cannot carry
                {sameHour.length > 1 ? ', together with the other corridor' : ''}
                {covered < r.overflow ? '; the rest wait for the next trains' : ''}.
              </p>
              <p className="muted">
                Why: {r.why}
                {inter.length ? ` · via ${inter.join(', ')}` : ''}
              </p>
            </div>
          </div>
        )
      })}
      <p className="muted small">Bus 80 passengers, at most 30 extra buses/hour per corridor (assumptions).{mine.length > 0 && other > 0 ? ` ${other} more on the other line tab.` : ''}</p>
    </Card>
  )
}

const VENUES = ['motera-stadium', 'kankaria-east', 'gandhigram', 'old-high-court', 'gujarat-university', 'mahatma-mandir', 'gift-city', 'kalupur', 'sachivalaya']

/** Custom event: any crowd event at a metro station, or an exam day. */
export function EventForm({ date, onAdd }: { date: string; onAdd: (e: CityEvent) => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<EventType>('stadium')
  const [station, setStation] = useState('motera-stadium')
  const [name, setName] = useState('My event')
  const [attendance, setAttendance] = useState(50000)
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('22:30')
  const toH = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h + m / 60
  }
  if (!open)
    return (
      <button className="ghost" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" /> Custom event
      </button>
    )
  return (
    <form
      className="eventform"
      onSubmit={(e) => {
        e.preventDefault()
        let endH = toH(end)
        if (endH < toH(start)) endH += 24
        onAdd({ id: crypto.randomUUID(), date, type, name, attendance, start: toH(start), end: endH, ...(type === 'stadium' ? { station } : {}) })
        setOpen(false)
      }}
    >
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
          <option value="stadium">Crowd event at a station</option>
          <option value="exam">Exam / college day</option>
        </select>
      </label>
      {type === 'stadium' && (
        <label>
          Nearest metro
          <select value={station} onChange={(e) => setStation(e.target.value)}>
            {VENUES.map((v) => (
              <option key={v} value={v}>
                {STATIONS[v].name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        People
        <input type="number" min={0} step={1000} value={attendance} onChange={(e) => setAttendance(Number(e.target.value))} />
      </label>
      <label>
        Starts
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label>
        Ends
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </label>
      <div className="formbtns">
        <button className="primary" type="submit">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function Chart({ plan }: { plan: Plan }) {
  const rows = plan.hours.filter((r) => r.hour >= 6)
  const W = 720,
    H = 220,
    L = 44,
    B = 24,
    T = 10
  const max = Math.max(...rows.map((r) => Math.max(r.load, r.currentCapacity, r.recommendedCapacity)), 1000) * 1.08
  const bw = (W - L - 8) / rows.length
  const x = (i: number) => L + i * bw
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const step = (key: 'currentCapacity' | 'recommendedCapacity') =>
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r[key])} L${x(i + 1)} ${y(r[key])}`).join(' ')
  const ticks = [0, max / 2, max].map((v) => Math.round(v / 500) * 500)
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hourly passenger load against current and recommended capacity">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="tick">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.hour}>
            <rect x={x(i) + 2} y={y(r.load)} width={bw - 4} height={y(0) - y(r.load)} className={r.load > r.currentCapacity ? 'bar over' : 'bar'} rx={2}>
              <title>{`${fmtHour(r.hour)}: ${n(r.load)} passengers/h · now ${n(r.currentCapacity)} · plan ${n(r.recommendedCapacity)}`}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" className="tick">
                {fmtHour(r.hour).slice(0, 2)}
              </text>
            )}
          </g>
        ))}
        <path d={step('currentCapacity')} className="cap now" />
        <path d={step('recommendedCapacity')} className="cap rec" />
      </svg>
      <div className="legend">
        <span>
          <i className="sw bar" /> Passengers/hour on the busiest link
        </span>
        <span>
          <i className="sw over" /> More than today’s trains carry
        </span>
        <span>
          <i className="sw now" /> Today’s capacity
        </span>
        <span>
          <i className="sw rec" /> Recommended capacity
        </span>
      </div>
    </div>
  )
}
