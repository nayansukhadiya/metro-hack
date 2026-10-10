import { Plus, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CityEvent, EventType } from '../data'
import { STATIONS } from '../network'

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
