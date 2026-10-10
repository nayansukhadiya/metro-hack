import { CalendarDays, ChevronLeft, ChevronRight, GraduationCap, PartyPopper, Plus, Search, Ticket, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CALENDAR, type CityEvent } from '../data'
import { fmtHour } from '../engine'
import { EVENT_TEMPLATES, fromTemplate, searchTemplates, type EventTemplate } from '../eventCatalog'
import { n } from '../mapUtil'
import { STATIONS } from '../network'

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const KIND_LABEL = { holiday: 'Holiday', 'festival-night': 'Festival night', 'low-travel': 'Low-travel festival' } as const

/** Month grid: holidays, festival nights, low-travel days and your events, marked with dots. */
export function MonthCalendar({ date, today, events, onPick }: { date: string; today: string; events: CityEvent[]; onPick: (d: string) => void }) {
  const [view, setView] = useState(() => ({ y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 }))
  const first = new Date(Date.UTC(view.y, view.m, 1))
  const lead = (first.getUTCDay() + 6) % 7 // Monday first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const marks = (d: string) => ({
    cal: CALENDAR.filter((c) => c.date === d),
    ev: events.filter((e) => e.date === d),
  })
  const shift = (k: number) => setView((v) => ({ y: v.m + k < 0 ? v.y - 1 : v.m + k > 11 ? v.y + 1 : v.y, m: (v.m + k + 12) % 12 }))
  const title = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="cal">
      <div className="calhead">
        <button className="iconbtn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft size={18} />
        </button>
        <strong>{title}</strong>
        <button className="iconbtn" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calgrid" role="grid" aria-label={title}>
        {WEEK.map((w) => (
          <span key={w} className="calwd" role="columnheader">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <span key={`x${i}`} />
          const ds = iso(view.y, view.m, d)
          const { cal, ev } = marks(ds)
          const tip = [...cal.map((c) => `${c.name} (${KIND_LABEL[c.kind]})`), ...ev.map((e) => e.name)].join(', ')
          return (
            <button
              key={ds}
              role="gridcell"
              aria-selected={ds === date}
              aria-label={`${d} ${title}${tip ? `: ${tip}` : ''}`}
              title={tip || undefined}
              className={`calday ${ds === date ? 'sel' : ''} ${ds === today ? 'today' : ''}`}
              onClick={() => onPick(ds)}
            >
              {d}
              <span className="caldots">
                {cal.map((c) => (
                  <i key={c.name} className={`dot ${c.kind}`} />
                ))}
                {ev.length > 0 && <i className="dot event" />}
              </span>
            </button>
          )
        })}
      </div>
      <div className="callegend">
        <span>
          <i className="dot holiday" /> holiday
        </span>
        <span>
          <i className="dot festival-night" /> festival night
        </span>
        <span>
          <i className="dot low-travel" /> low-travel
        </span>
        <span>
          <i className="dot event" /> your event
        </span>
      </div>
    </div>
  )
}

const typeIcon = (t: EventTemplate) => (t.type === 'exam' ? GraduationCap : t.station === 'motera-stadium' ? Ticket : PartyPopper)

/** Search event types and festivals; add an event to the selected date or jump to a festival. */
export function EventSearch({ date, onAdd, onPick }: { date: string; onAdd: (e: CityEvent) => void; onPick: (d: string) => void }) {
  const [q, setQ] = useState('')
  const templates = useMemo(() => searchTemplates(q), [q])
  const festivals = useMemo(() => {
    const w = q.toLowerCase().trim()
    return w ? CALENDAR.filter((c) => c.name.toLowerCase().includes(w)).slice(0, 4) : []
  }, [q])
  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <div className="esearch">
      <label className="searchbox">
        <Search size={16} aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events: cricket, concert, carnival, exam, Diwali…" aria-label="Search events" />
        {q && (
          <button className="iconbtn" aria-label="Clear search" onClick={() => setQ('')}>
            <X size={14} />
          </button>
        )}
      </label>
      <ul className="results" aria-label="Event types">
        {festivals.map((c) => (
          <li key={c.date + c.name}>
            <CalendarDays size={16} aria-hidden="true" />
            <div>
              <strong>{c.name}</strong>
              <small>
                {KIND_LABEL[c.kind]} · {new Date(c.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} (built in)
              </small>
            </div>
            <button onClick={() => onPick(c.date)}>Go to date</button>
          </li>
        ))}
        {templates.slice(0, q ? 8 : 5).map((t) => {
          const Icon = typeIcon(t)
          return (
            <li key={t.id}>
              <Icon size={16} aria-hidden="true" />
              <div>
                <strong>{t.name}</strong>
                <small>
                  {n(t.attendance)} people · {fmtHour(t.start)}–{fmtHour(t.end)}
                  {t.station ? ` · metro ${STATIONS[t.station].name}` : ''} · {t.note}
                </small>
                {t.suggestedDates && (
                  <span className="sugg">
                    Usual dates:{' '}
                    {t.suggestedDates.slice(0, 3).map((d) => (
                      <button key={d} className="linkbtn" onClick={() => onPick(d)}>
                        {new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </button>
                    ))}
                    …
                  </span>
                )}
              </div>
              <button className="primary" onClick={() => onAdd(fromTemplate(t, date))} aria-label={`Add ${t.name} on ${dayLabel}`}>
                <Plus size={14} aria-hidden="true" /> {dayLabel}
              </button>
            </li>
          )
        })}
        {!templates.length && !festivals.length && <li className="muted">No match. Add a custom event below.</li>}
      </ul>
      {!q && <p className="muted small">{EVENT_TEMPLATES.length} event types; type to search. Crowd sizes and timings are typical values (assumptions).</p>}
    </div>
  )
}
