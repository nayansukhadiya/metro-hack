import {
  Bus,
  CalendarDays,
  ChartColumn,
  Check,
  Clock,
  CloudRain,
  Copy,
  Gauge,
  Info,
  ListChecks,
  Map as MapIcon,
  MoonStar,
  Radio,
  Route,
  Sparkles,
  TrainFront,
  TrainTrack,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { reliefPlan, type Relief } from './brts'
import { ASSUMPTIONS, MODEL, type CityEvent } from './data'
import { buildContext, computePlan, fmtHour } from './engine'
import { fromTemplate, EVENT_TEMPLATES } from './eventCatalog'
import { serviceHour } from './flows'
import { bandLabel, buildOverview, justify, linkLabel, type DayOverview, type JustifyResult } from './justify'
import { n } from './mapUtil'
import { APMC_DEPARTURES, LINE, LINES, OPERATIONS, SERVICES, SOURCES, STATIONS, type ServiceId } from './network'
import { controlRoomText, copyText } from './report'
import RouteMap from './RouteMap'
import { EventSearch, MonthCalendar } from './ui/DayPicker'
import FleetPanel from './ui/FleetPanel'
import { Card, Chart, EventForm, ReliefCard, Stat } from './ui/parts'
import { fetchRainMm } from './weather'
import './App.css'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const IST = 5.5 * 3_600_000
const tomorrow = () => iso(new Date(Date.now() + 86_400_000 + IST))
/** Current date and decimal hour in Ahmedabad. */
const nowIST = () => {
  const d = new Date(Date.now() + IST)
  return { date: iso(d), hour: d.getUTCHours() + d.getUTCMinutes() / 60 }
}
function useNow() {
  const [now, setNow] = useState(nowIST)
  useEffect(() => {
    const t = setInterval(() => setNow(nowIST()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function loadEvents(): CityEvent[] {
  try {
    return JSON.parse(localStorage.getItem('events') ?? '[]')
  } catch {
    return []
  }
}

const DEFAULT_FLEET = { blue: OPERATIONS.blue.fleet, redYellow: OPERATIONS.redYellow.fleet }

export default function App() {
  const [date, setDate] = useState(tomorrow())
  const [events, setEvents] = useState<CityEvent[]>(loadEvents)
  const [rain, setRain] = useState<number | null>(null)
  const [rainSource, setRainSource] = useState<'forecast' | 'manual' | 'none'>('none')
  const [just, setJust] = useState<JustifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<ServiceId>('redYellow')
  const [fleets, setFleets] = useState<Record<ServiceId, number>>(DEFAULT_FLEET)
  const now = useNow()

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

  const ctx = useMemo(() => buildContext(date, events, rain), [date, events, rain])
  const plans = useMemo(
    () => ({ blue: computePlan(ctx, 'blue', fleets.blue), redYellow: computePlan(ctx, 'redYellow', fleets.redYellow) }),
    [ctx, fleets],
  )
  const plan = plans[line]
  // surge → Janmarg: hours where even the shortest headway the fleet allows cannot carry the busiest link
  const relief = useMemo<Relief[]>(
    () => (['blue', 'redYellow'] as const).flatMap((sid) => reliefPlan(plans[sid], (h) => serviceHour(ctx, sid, h))),
    [plans, ctx],
  )
  const live = date === now.date
  const nowHour = now.hour < 5 ? now.hour + 24 : now.hour
  const liveRow = live ? plan.hours.find((r) => r.hour === Math.floor(nowHour)) : undefined

  // both lines and Janmarg relief, for the one-line day summary
  const overview = useMemo<DayOverview>(() => buildOverview(date, plans, relief), [date, plans, relief])
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const copyPlan = async () => {
    const ok = await copyText(controlRoomText(plan, overview, just, relief))
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied('idle'), 2500)
  }

  useEffect(() => {
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      justify(plan, overview).then((r) => {
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
  }, [plan, overview])

  const addEvent = (e: CityEvent) => setEvents((ev) => [...ev, e])
  const matchDemo = () => {
    const d = '2026-10-26'
    setDate(d)
    setEvents((ev) => (ev.some((e) => e.date === d && e.type === 'stadium') ? ev : [...ev, fromTemplate(EVENT_TEMPLATES[0], d)]))
  }

  const dayEvents = events.filter((e) => e.date === date)
  const s = plan.summary
  const longDate = new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const reliefBuses = Math.max(0, ...relief.map((r) => r.buses))
  const changes = plan.bands.filter((b) => b.change !== 'same').length

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <TrainFront size={22} />
          </span>
          <div>
            <strong>Headway Planner</strong>
            <span>Ahmedabad Metro + Janmarg BRTS · Metro Hacks PS-04</span>
          </div>
        </div>
        <div className="topright">
          {live ? (
            <span className="pill live-pill">
              <span className="pulse" aria-hidden="true" /> Live {fmtHour(now.hour)}
            </span>
          ) : (
            <button className="pill" onClick={() => setDate(now.date)}>
              <Radio size={14} aria-hidden="true" /> Go live
            </button>
          )}
        </div>
        <div className="linestripe" aria-hidden="true">
          {LINES.map((l) => (
            <i key={l.id} style={{ background: l.color }} />
          ))}
          <i style={{ background: '#1f3a68' }} />
        </div>
      </header>

      <main className="app">
        <section className="how" aria-label="How it works">
          <div>
            <CalendarDays size={20} aria-hidden="true" />
            <span>
              <strong>1. Pick a day</strong> Holidays and festivals are built in; add matches, concerts or exams.
            </span>
          </div>
          <div>
            <Users size={20} aria-hidden="true" />
            <span>
              <strong>2. We model the crowd</strong> Offices, colleges and events set when and where people travel, station by station.
            </span>
          </div>
          <div>
            <TrainFront size={20} aria-hidden="true" />
            <span>
              <strong>3. You get the plan</strong> Train frequency per hour, fleet needs, and Janmarg buses when the metro is full.
            </span>
          </div>
        </section>

        <div className="pickgrid">
          <Card icon={CalendarDays} step="1" title="Pick the day" sub="Dots mark holidays, festival nights and your events. Tap a date.">
            <MonthCalendar key={date.slice(0, 7)} date={date} today={now.date} events={events} onPick={setDate} />
            <div className="quick">
              <button onClick={() => setDate(now.date)}>Today</button>
              <button onClick={() => setDate(tomorrow())}>Tomorrow</button>
              <button onClick={() => setDate('2026-10-26')}>Normal Monday</button>
              <button onClick={() => setDate('2026-10-11')}>Navratri night 1</button>
              <button onClick={() => setDate('2026-11-08')}>Diwali</button>
              <button className="primary" onClick={matchDemo}>
                <Sparkles size={14} aria-hidden="true" /> Match-night demo
              </button>
            </div>
          </Card>

          <Card icon={Sparkles} title={`What’s on, ${longDate}`} sub="Search an event type and add it to this date. Everything recalculates instantly.">
            <div className="chips">
              <span className="chip">{plan.ctx.dayType}</span>
              {plan.ctx.calendar.map((c) => (
                <span key={c.name} className={`chip ${c.kind}`}>
                  {c.kind === 'festival-night' ? <MoonStar size={13} aria-hidden="true" /> : <CalendarDays size={13} aria-hidden="true" />} {c.name}
                </span>
              ))}
              {dayEvents.map((e) => (
                <span key={e.id} className="chip event">
                  {e.name} · {n(e.attendance)} · {fmtHour(e.start)}–{fmtHour(e.end)}
                  {e.station ? ` · ${STATIONS[e.station]?.name ?? ''}` : ''}
                  <button className="iconbtn" aria-label={`Remove ${e.name}`} onClick={() => setEvents((ev) => ev.filter((x) => x.id !== e.id))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {rain != null && rain >= MODEL.rainHeavyMm && (
                <span className="chip rain">
                  <CloudRain size={13} aria-hidden="true" /> Heavy rain {rain} mm
                </span>
              )}
            </div>
            <EventSearch date={date} onAdd={addEvent} onPick={setDate} />
            <div className="row formrow">
              <EventForm date={date} onAdd={addEvent} />
              <label className="rain">
                <CloudRain size={15} aria-hidden="true" /> Rain
                <input
                  type="number"
                  min={0}
                  value={rain ?? ''}
                  placeholder="mm"
                  onChange={(e) => {
                    setRain(e.target.value === '' ? null : Number(e.target.value))
                    setRainSource('manual')
                  }}
                />
                <small>{rainSource === 'forecast' ? 'forecast' : rainSource === 'manual' ? 'by hand' : 'no forecast'}</small>
              </label>
            </div>
          </Card>
        </div>

        {just && (
          <section className="daysummary" aria-live="polite">
            <span className="label">
              <Sparkles size={13} aria-hidden="true" /> The answer · {just.provider === 'gemini' ? 'written by Gemini, numbers checked' : 'day summary'}
            </span>
            <p>{just.summary.en}</p>
            {just.summary.gu && <p className="gu">{just.summary.gu}</p>}
          </section>
        )}

        <div className="tabs" role="tablist" aria-label="Line to plan">
          {(Object.keys(SERVICES) as ServiceId[]).map((id) => (
            <button key={id} role="tab" aria-selected={line === id} className={line === id ? 'on' : ''} onClick={() => setLine(id)}>
              {SERVICES[id].lines.map((l) => (
                <i key={l} className="dotline" style={{ background: LINE[l].color }} />
              ))}
              {SERVICES[id].name}
              <span className="count">{plans[id].bands.filter((b) => b.change !== 'same').length}</span>
            </button>
          ))}
        </div>

        {live && (
          <p className="live">
            <span className="pulse" aria-hidden="true" /> <strong>Now {fmtHour(now.hour)}</strong>
            {liveRow && (liveRow.recommendedHeadway || liveRow.currentHeadway) ? (
              <>
                {' '}
                · about {n(liveRow.load)} passengers/hour on {linkLabel(liveRow.link)} · running every {liveRow.currentHeadway ?? '—'} min, plan says{' '}
                {liveRow.recommendedHeadway ?? '—'} min
                {liveRow.overflow > 0 && (
                  <>
                    {' '}
                    · <strong>{n(liveRow.overflow)}/h over capacity: Janmarg relief on</strong>
                  </>
                )}
              </>
            ) : (
              <> · {SERVICES[line].name}: no service this hour</>
            )}
          </p>
        )}

        <section className="stats">
          <Stat icon={Users} label="Peak crowd, busiest stretch" value={`${n(s.peakLoad)}/h`} hint={`${fmtHour(s.peakHour)} · ${linkLabel(s.peakLink)}`} />
          <Stat icon={ListChecks} label="Changes to the timetable" value={String(changes)} hint={`${s.extraTripsPerDirection ? `+${s.extraTripsPerDirection}` : 'no'} extra trips each way`} />
          <Stat
            icon={Clock}
            label="Last train"
            value={s.lastTrain ? fmtHour(s.lastTrain) : '—'}
            hint={s.lastTrain && s.lastTrain > s.currentLastTrain ? `usually ${fmtHour(s.currentLastTrain)}` : 'as usual'}
            alert={!!s.lastTrain && s.lastTrain > s.currentLastTrain}
          />
          <Stat
            icon={TrainTrack}
            label="Trainsets at the busiest hour"
            value={`${s.peakTrainsNeeded} of ${s.fleet}`}
            hint={s.fleetLimited ? `fleet caps trains at every ${s.fleetFloor} min` : s.shortTurn ? `short-turn ${OPERATIONS[line].shortTurn}` : 'within the fleet'}
            alert={s.fleetLimited}
          />
          <Stat icon={TriangleAlert} label="Left behind on today’s timetable" value={n(s.leftBehindCurrent)} hint="if nothing changes" alert={s.leftBehindCurrent > 500} />
          <Stat
            icon={Bus}
            label="Overflow to Janmarg"
            value={s.peakOverflow ? `${n(s.peakOverflow)}/h` : '0'}
            hint={s.peakOverflow ? `at ${s.fleetFloor}-min trains` : 'metro carries it all'}
            alert={s.peakOverflow > 0}
          />
        </section>

        <p className="finding">
          <Info size={16} aria-hidden="true" />
          <span>
            {line === 'redYellow' ? (
              <>
                <strong>Finding:</strong> GMRC’s real timetable (18 May 2026) runs Red+Yellow every {s.currentBestHeadway} min at best (4 trains/hour), not the 12
                min we first assumed. Off-peak gaps reach {s.currentWorstHeadway} min; the last APMC departure is {APMC_DEPARTURES[APMC_DEPARTURES.length - 1]}.
              </>
            ) : (
              <>
                <strong>Blue line timetable</strong> (GMRC, Jul 2025): every 7 min at peak, 10 min off-peak; Sundays and holidays 10 / 12 min.
              </>
            )}
          </span>
        </p>

        <Card icon={MapIcon} step="2" title="Live network" sub="Move the hour slider to watch crowds build. Tap a station for its offices, colleges and nearest Janmarg stop.">
          <RouteMap key={date} ctx={ctx} initialHour={live && nowHour >= 6 ? Math.floor(nowHour) : s.peakHour} relief={relief} />
        </Card>

        <Card icon={TrainTrack} step="3" title="Fleet" sub="Trainsets each hour needs against what each line has. Change the fleet to try options; the whole plan updates.">
          <FleetPanel plans={plans} fleets={fleets} onChange={setFleets} reliefBuses={reliefBuses} />
        </Card>

        {relief.length > 0 && <ReliefCard relief={relief} line={line} floor={s.fleetFloor} />}

        <Card
          icon={Route}
          step="4"
          title={`Recommended changes · ${SERVICES[line].name}`}
          sub="Each time band: today’s frequency → recommended, with the reason in English and Gujarati."
          actions={
            <>
              {just && (
                <span className={`badge ${just.provider}`}>{busy ? 'updating…' : just.provider === 'gemini' ? 'Gemini · numbers checked' : 'Template'}</span>
              )}
              <button className="primary" onClick={copyPlan} disabled={busy}>
                {copied === 'ok' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy for control room'}
              </button>
            </>
          }
        >
          {just?.note && <p className="note">{just.note}</p>}
          <div className="table">
            {plan.bands.map((b) => {
              const text = just?.lines.find((l) => l.band === bandLabel(b))
              const isNow = live && nowHour >= b.from && nowHour < b.to
              return (
                <div key={b.from} className={`band ${b.change} ${isNow ? 'now' : ''}`}>
                  <div className="when">
                    {bandLabel(b)}
                    <small>{linkLabel(b.link)}</small>
                    {isNow && <span className="nowtag">now</span>}
                    {relief.some((r) => r.service === line && r.from < b.to && r.to > b.from) && <span className="nowtag bus">+ Janmarg</span>}
                  </div>
                  <div className="hw">
                    <span className="now">{b.currentHeadway ? `${b.currentHeadway} min` : 'no service'}</span>
                    <span className="arrow">→</span>
                    <span className="rec">{b.recommendedHeadway ? `${b.recommendedHeadway} min` : 'none'}</span>
                  </div>
                  <div className="why">
                    {b.change === 'same' ? (
                      <span className="muted">
                        Keep as is · {n(b.peakLoad)}/h fits {n(b.currentCapacity)}/h
                      </span>
                    ) : (
                      <>
                        <p>{text?.en ?? '…'}</p>
                        {text?.gu && <p className="gu">{text.gu}</p>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card icon={ChartColumn} title="Demand vs capacity, by hour" sub="Bars: passengers on the busiest stretch. Lines: what today’s trains and the recommended trains can carry.">
          <Chart plan={plan} />
        </Card>

        <details className="card">
          <summary>
            <Gauge size={16} aria-hidden="true" /> Data and assumptions
          </summary>
          <ul>
            {ASSUMPTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
            <li>Event types in the search use typical crowd sizes and timings (assumptions); you choose the date.</li>
            <li>The fleet limits frequency: trainsets ÷ round-trip time sets the shortest headway (short-turn APMC⇄Motera where needed).</li>
          </ul>
          <p className="muted">
            Pilot model (PPP): a private partner builds and runs this as a service for GMRC, paid by an annual licence or a share of extra event-day fare revenue. GMRC keeps
            the data. It never touches signalling.
          </p>
        </details>

        <footer className="footer">
          <p>
            <strong>Data sources:</strong> {SOURCES} · Janmarg BRTS route map (Ahmedabad Janmarg Ltd) · Open-Meteo forecast · map tiles © OpenStreetMap contributors.
          </p>
          <p>Office and college timings, sizes and metro shares marked “assumed” are estimates; the plan is advice for operators and never touches signalling.</p>
        </footer>
      </main>
    </div>
  )
}
