import { useEffect, useMemo, useState } from 'react'
import { ASSUMPTIONS, MODEL, type CityEvent, type EventType } from './data'
import { buildContext, computePlan, fmtHour, type Plan } from './engine'
import { bandLabel, justify, type JustifyResult } from './justify'
import { fetchRainMm } from './weather'
import './App.css'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const tomorrow = () => iso(new Date(Date.now() + 86_400_000 + 5.5 * 3_600_000))
const n = (x: number) => x.toLocaleString('en-IN')

function loadEvents(): CityEvent[] {
  try {
    return JSON.parse(localStorage.getItem('events') ?? '[]')
  } catch {
    return []
  }
}

export default function App() {
  const [date, setDate] = useState(tomorrow())
  const [events, setEvents] = useState<CityEvent[]>(loadEvents)
  const [rain, setRain] = useState<number | null>(null)
  const [rainSource, setRainSource] = useState<'forecast' | 'manual' | 'none'>('none')
  const [just, setJust] = useState<JustifyResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem('events', JSON.stringify(events))
    } catch {
      /* storage unavailable */
    }
  }, [events])

  useEffect(() => {
    let alive = true
    setRain(null)
    setRainSource('none')
    fetchRainMm(date).then((mm) => {
      if (alive && mm != null) {
        setRain(mm)
        setRainSource('forecast')
      }
    })
    return () => {
      alive = false
    }
  }, [date])

  const plan = useMemo(() => computePlan(buildContext(date, events, rain)), [date, events, rain])

  useEffect(() => {
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      justify(plan).then((r) => {
        if (alive) {
          setJust(r)
          setBusy(false)
        }
      })
    }, 400)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [plan])

  const addMatch = () =>
    setEvents((ev) => [
      ...ev,
      { id: crypto.randomUUID(), date, type: 'stadium', name: 'Cricket match at Motera', attendance: 110000, start: 19.5, end: 23.25 },
    ])

  const dayEvents = events.filter((e) => e.date === date)
  const s = plan.summary
  const weekday = new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <div className="app">
      <header>
        <p className="eyebrow">PS-04 · No Day Is an Average Day</p>
        <h1>Headway Planner</h1>
        <p className="sub">APMC ⇄ Mahatma Mandir · tomorrow’s calendar in, headway changes out</p>
      </header>

      <section className="card controls">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <div className="quick">
          <button onClick={() => setDate(tomorrow())}>Tomorrow</button>
          <button onClick={() => setDate('2026-10-26')}>Normal Monday</button>
          <button onClick={() => setDate('2026-10-11')}>Navratri night 1</button>
          <button onClick={() => setDate('2026-11-08')}>Diwali</button>
        </div>
        <label>
          Rain (mm)
          <input
            type="number"
            min={0}
            value={rain ?? ''}
            placeholder="—"
            onChange={(e) => {
              setRain(e.target.value === '' ? null : Number(e.target.value))
              setRainSource('manual')
            }}
          />
          <small>{rainSource === 'forecast' ? 'Open-Meteo forecast' : rainSource === 'manual' ? 'entered by hand' : 'no forecast'}</small>
        </label>
      </section>

      <section className="day">
        <h2>{weekday}</h2>
        <div className="chips">
          <span className="chip">{plan.ctx.dayType}</span>
          {plan.ctx.calendar.map((c) => (
            <span key={c.name} className={`chip ${c.kind}`}>{c.name}</span>
          ))}
          {dayEvents.map((e) => (
            <span key={e.id} className="chip event">
              {e.name} · {n(e.attendance)} · ends {fmtHour(e.end)}
              <button aria-label="Remove event" onClick={() => setEvents((ev) => ev.filter((x) => x.id !== e.id))}>×</button>
            </span>
          ))}
          {rain != null && rain >= MODEL.rainHeavyMm && <span className="chip rain">Heavy rain {rain} mm</span>}
        </div>
        <EventForm date={date} onAdd={(e) => setEvents((ev) => [...ev, e])} onMatch={addMatch} />
      </section>

      <section className="stats">
        <Stat label="Peak load, busiest link" value={`${n(s.peakLoad)}/h`} hint={`at ${fmtHour(s.peakHour)}`} />
        <Stat label="Extra trips, each way" value={s.extraTripsPerDirection ? `+${s.extraTripsPerDirection}` : '0'} hint="vs today’s timetable" />
        <Stat
          label="Last train"
          value={s.lastTrain ? fmtHour(s.lastTrain) : '—'}
          hint={s.lastTrain && s.lastTrain > s.currentLastTrain ? `now ${fmtHour(s.currentLastTrain)}` : 'no change'}
          alert={!!s.lastTrain && s.lastTrain > s.currentLastTrain}
        />
        <Stat label="Trains at peak" value={String(s.peakTrainsNeeded)} hint={s.shortTurn ? 'short-turn APMC⇄Motera' : `of ${MODEL.corridorFleet} on corridor`} />
        <Stat label="Left behind today" value={n(s.leftBehindCurrent)} hint="if the normal timetable runs" alert={s.leftBehindCurrent > 500} />
      </section>

      <section className="card">
        <h3>Demand vs capacity, by hour</h3>
        <Chart plan={plan} />
      </section>

      <section className="card">
        <div className="row">
          <h3>Recommended changes</h3>
          {just && (
            <span className={`badge ${just.provider}`}>
              {busy ? 'updating…' : just.provider === 'gemini' ? 'Written by Gemini · numbers checked' : 'Template'}
            </span>
          )}
        </div>
        {just?.note && <p className="note">{just.note}</p>}
        <div className="table">
          {plan.bands.map((b) => {
            const line = just?.lines.find((l) => l.band === bandLabel(b))
            return (
              <div key={b.from} className={`band ${b.change}`}>
                <div className="when">{bandLabel(b)}</div>
                <div className="hw">
                  <span className="now">{b.currentHeadway ? `${b.currentHeadway} min` : 'no service'}</span>
                  <span className="arrow">→</span>
                  <span className="rec">{b.recommendedHeadway ? `${b.recommendedHeadway} min` : 'none'}</span>
                </div>
                <div className="why">
                  {b.change === 'same' ? (
                    <span className="muted">Keep as is · {n(b.peakLoad)}/h fits {n(b.currentCapacity)}/h</span>
                  ) : (
                    <>
                      <p>{line?.en ?? '…'}</p>
                      {line?.gu && <p className="gu">{line.gu}</p>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <details className="card">
        <summary>Data and assumptions</summary>
        <ul>
          {ASSUMPTIONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="muted">
          Pilot model (PPP): a private partner builds and runs this as a service for GMRC, paid by an annual licence or a share of extra
          event-day fare revenue. GMRC keeps the data. It never touches signalling.
        </p>
      </details>
    </div>
  )
}

function Stat({ label, value, hint, alert }: { label: string; value: string; hint: string; alert?: boolean }) {
  return (
    <div className={`stat ${alert ? 'alert' : ''}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="hint">{hint}</span>
    </div>
  )
}

function EventForm({ date, onAdd, onMatch }: { date: string; onAdd: (e: CityEvent) => void; onMatch: () => void }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<EventType>('stadium')
  const [name, setName] = useState('Concert at Motera')
  const [attendance, setAttendance] = useState(80000)
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('22:30')
  const toH = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h + m / 60
  }
  return (
    <div className="eventform">
      <button className="primary" onClick={onMatch}>+ Cricket match at Motera</button>
      <button onClick={() => setOpen((o) => !o)}>{open ? 'Close' : '+ Other event'}</button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            let endH = toH(end)
            if (endH < toH(start)) endH += 24
            onAdd({ id: crypto.randomUUID(), date, type, name, attendance, start: toH(start), end: endH })
            setOpen(false)
          }}
        >
          <select value={type} onChange={(e) => setType(e.target.value as EventType)}>
            <option value="stadium">Stadium event (Motera)</option>
            <option value="exam">Exam / college day</option>
          </select>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <input type="number" value={attendance} onChange={(e) => setAttendance(Number(e.target.value))} aria-label="Attendance" />
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End" />
          <button className="primary" type="submit">Add</button>
        </form>
      )}
    </div>
  )
}

function Chart({ plan }: { plan: Plan }) {
  const rows = plan.hours.filter((r) => r.hour >= 6)
  const W = 720, H = 220, L = 44, B = 24, T = 10
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
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="tick">{t >= 1000 ? `${t / 1000}k` : t}</text>
          </g>
        ))}
        {rows.map((r, i) => (
          <g key={r.hour}>
            <rect x={x(i) + 2} y={y(r.load)} width={bw - 4} height={y(0) - y(r.load)} className={r.load > r.currentCapacity ? 'bar over' : 'bar'} rx={2}>
              <title>{`${fmtHour(r.hour)}: ${n(r.load)} passengers/h · now ${n(r.currentCapacity)} · plan ${n(r.recommendedCapacity)}`}</title>
            </rect>
            {i % 2 === 0 && <text x={x(i) + bw / 2} y={H - 6} textAnchor="middle" className="tick">{fmtHour(r.hour).slice(0, 2)}</text>}
          </g>
        ))}
        <path d={step('currentCapacity')} className="cap now" />
        <path d={step('recommendedCapacity')} className="cap rec" />
      </svg>
      <div className="legend">
        <span><i className="sw bar" /> Passengers/hour</span>
        <span><i className="sw over" /> Above today’s capacity</span>
        <span><i className="sw now" /> Today’s capacity</span>
        <span><i className="sw rec" /> Recommended capacity</span>
      </div>
    </div>
  )
}
