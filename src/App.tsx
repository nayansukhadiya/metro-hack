import { Bus, CalendarDays, Check, ChartColumn, Copy, Droplets, Gauge, Lightbulb, Map as MapIcon, MapPin, Moon, Radio, Route, Sparkles, Sun, TrainFront, TrainTrack, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { reliefPlan, type Relief } from './brts'
import { ASSUMPTIONS, MODEL, type CityEvent } from './data'
import { buildContext, computePlan, fmtHour } from './engine'
import { EVENT_TEMPLATES, fromTemplate } from './eventCatalog'
import { serviceHour } from './flows'
import { buildOverview, justify, linkLabel, type DayOverview, type JustifyResult } from './justify'
import { FIRST_HOUR, LAST_HOUR, boardingsAt, n } from './mapUtil'
import { APMC_DEPARTURES, OPERATIONS, SERVICES, SOURCES, STATIONS, type ServiceId } from './network'
import { networkDay } from './networkDay'
import { controlRoomText, copyText } from './report'
import RouteMap from './RouteMap'
import StationInfo from './StationInfo'
import { Alerts, DayChips, FleetStatus, HourCard, Kpis, LineDots, RecTable, ReliefSection, ScenarioBar } from './ui/control'
import DemandChart from './ui/DemandChart'
import { EventSearch, MonthCalendar } from './ui/DayPicker'
import FleetPanel from './ui/FleetPanel'
import { buildAlerts, changeKind } from './ui/model'
import { Card, EventForm } from './ui/parts'
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
function loadTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

const DEFAULT_FLEET = { blue: OPERATIONS.blue.fleet, redYellow: OPERATIONS.redYellow.fleet }
const isMoteraMatch = (e: CityEvent) => e.type === 'stadium' && (e.station ?? 'motera-stadium') === 'motera-stadium'

export default function App() {
  const [date, setDate] = useState(tomorrow())
  const [events, setEvents] = useState<CityEvent[]>(loadEvents)
  const [rain, setRain] = useState<number | null>(null)
  const [rainSource, setRainSource] = useState<'forecast' | 'manual' | 'none'>('none')
  const [just, setJust] = useState<JustifyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<ServiceId>('redYellow')
  const [fleets, setFleets] = useState<Record<ServiceId, number>>(DEFAULT_FLEET)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [hourSel, setHourSel] = useState<{ date: string; h: number } | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(loadTheme)
  const now = useNow()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage unavailable */
    }
  }, [theme])

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
  const day = useMemo(() => networkDay(ctx), [ctx])
  const live = date === now.date
  const nowHour = now.hour < 5 ? now.hour + 24 : now.hour
  const liveRow = live ? plan.hours.find((r) => r.hour === Math.floor(nowHour)) : undefined

  // the hour shown on the network: the live hour today, otherwise the peak, until the user moves the slider
  const defaultHour = Math.min(LAST_HOUR, Math.max(FIRST_HOUR, live && nowHour >= FIRST_HOUR ? Math.floor(nowHour) : plan.summary.peakHour))
  const hour = hourSel && hourSel.date === date ? hourSel.h : defaultHour
  const setHour = useCallback((h: number) => setHourSel({ date, h }), [date])

  // both lines and Janmarg relief, for the one-line day summary
  const overview = useMemo<DayOverview>(() => buildOverview(date, plans, relief), [date, plans, relief])
  const alerts = useMemo(() => buildAlerts(plans, relief, ctx), [plans, relief, ctx])
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
  const dayEvents = events.filter((e) => e.date === date)
  const matchOn = dayEvents.some(isMoteraMatch)
  const toggleMatch = () =>
    setEvents((ev) => (matchOn ? ev.filter((e) => !(e.date === date && isMoteraMatch(e))) : [...ev, fromTemplate(EVENT_TEMPLATES[0], date)]))

  const presets = [
    { label: 'Today (live)', date: now.date },
    { label: 'Tomorrow', date: tomorrow() },
    { label: 'Normal Monday', date: '2026-10-26' },
    { label: 'Navratri night 1', date: '2026-10-11' },
    { label: 'Diwali', date: '2026-11-08' },
  ]
  const kinds = plan.bands.map(changeKind)
  const gapFills = kinds.filter((k) => k === 'gap').length
  const demandChanges = kinds.filter((k) => k !== 'gap' && k !== 'same').length
  const hourRow = plan.hours.find((r) => r.hour === hour)
  const hourBand = plan.bands.find((b) => hour >= b.from && hour < b.to)
  const busiest = Object.keys(STATIONS)
    .filter((id) => !STATIONS[id].closed)
    .map((id) => ({ id, b: boardingsAt(day.hours[hour], id) }))
    .sort((a, b) => b.b - a.b)
    .slice(0, 5)
  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const dayKind = ctx.calendar[0]?.name ?? (dayEvents[0]?.name ? `${dayEvents[0].name}` : ctx.dayType === 'weekday' ? 'Normal weekday' : ctx.dayType === 'saturday' ? 'Saturday' : 'Sunday')

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <TrainFront size={20} />
          </span>
          <div className="brandtext">
            <strong>Headway Planner</strong>
            <span>
              Ahmedabad Metro <em>+ Janmarg BRTS</em>
            </span>
          </div>
          <span className="brandsub">Metro operations &amp; city public transport · plan any day</span>
        </div>
        <div className="topchips">
          <span className="tchip" title={rainSource === 'forecast' ? 'Open-Meteo forecast' : rainSource === 'manual' ? 'Entered by hand' : 'No forecast'}>
            <Droplets size={15} aria-hidden="true" />
            <span>
              <strong>{rain == null ? 'Rain —' : `${rain} mm rain`}</strong>
              <small>{rainSource === 'forecast' ? 'Open-Meteo' : rainSource === 'manual' ? 'by hand' : 'no forecast'}</small>
            </span>
          </span>
          <span className="tchip">
            <CalendarDays size={15} aria-hidden="true" />
            <span>
              <strong>{dayLabel}</strong>
              <small>{dayKind}</small>
            </span>
          </span>
          {live ? (
            <span className="tchip live">
              <span className="pulse" aria-hidden="true" />
              <span>
                <strong>Live {fmtHour(now.hour)}</strong>
                <small>IST</small>
              </span>
            </span>
          ) : (
            <button className="tchip" onClick={() => setDate(now.date)}>
              <Radio size={15} aria-hidden="true" />
              <span>
                <strong>Go live</strong>
                <small>plan today</small>
              </span>
            </button>
          )}
          <button
            className="iconbtn bordered"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main className="app">
        <ScenarioBar
          date={date}
          onDate={setDate}
          presets={presets}
          matchOn={matchOn}
          onMatch={toggleMatch}
          eventsOpen={eventsOpen}
          onEvents={() => setEventsOpen((o) => !o)}
          eventCount={dayEvents.length}
          rain={rain}
          rainSource={rainSource}
          onRain={(v) => {
            setRain(v)
            setRainSource('manual')
          }}
        />
        <DayChips ctx={ctx} dayEvents={dayEvents} onRemove={(id) => setEvents((ev) => ev.filter((x) => x.id !== id))} />

        {eventsOpen && (
          <section className="panel drawer" aria-label="Events and calendar">
            <div className="drawerhead">
              <strong>
                <CalendarDays size={16} aria-hidden="true" /> Calendar and events
              </strong>
              <button className="iconbtn" aria-label="Close events" onClick={() => setEventsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="drawergrid">
              <MonthCalendar key={date.slice(0, 7)} date={date} today={now.date} events={events} onPick={setDate} />
              <div className="drawerright">
                <EventSearch date={date} onAdd={addEvent} onPick={setDate} />
                <EventForm date={date} onAdd={addEvent} />
              </div>
            </div>
          </section>
        )}

        <section className="overview" aria-label="Operational overview">
          <div className="ov-head">
            <div className="linetabs" role="tablist" aria-label="Line to plan">
              {(Object.keys(SERVICES) as ServiceId[]).map((id) => (
                <button key={id} role="tab" aria-selected={line === id} className={line === id ? 'on' : ''} onClick={() => setLine(id)}>
                  <LineDots sid={id} />
                  {SERVICES[id].name}
                  <span className="tcount">{plans[id].bands.filter((b) => b.change !== 'same').length}</span>
                </button>
              ))}
            </div>
            {just && (
              <div className="summary" aria-live="polite">
                <span className="sumlabel">
                  <Sparkles size={13} aria-hidden="true" /> {just.provider === 'gemini' ? 'Day summary · Gemini, numbers checked' : 'Day summary'}
                </span>
                <p>{just.summary.en}</p>
                {just.summary.gu && <p className="gu">{just.summary.gu}</p>}
              </div>
            )}
          </div>
          <Kpis plan={plan} gapFills={gapFills} demandChanges={demandChanges} />
        </section>

        <Alerts alerts={alerts} />

        {live && (
          <p className="livestrip">
            <span className="pulse" aria-hidden="true" /> <strong>Now {fmtHour(now.hour)}</strong>
            {liveRow && (liveRow.recommendedHeadway || liveRow.currentHeadway) ? (
              <>
                {' '}
                · {SERVICES[line].name}: about {n(liveRow.load)} passengers/hour on {linkLabel(liveRow.link)} · running every {liveRow.currentHeadway ?? '—'} min, plan
                says {liveRow.recommendedHeadway ?? '—'} min
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

        <div className="workspace" id="network">
          <Card icon={MapIcon} title="Network" sub="Move the hour or press play to watch crowds build. Tap a station for its details." className="netpanel">
            <RouteMap day={day} hour={hour} onHour={setHour} selected={selected} onSelect={setSelected} relief={relief} />
          </Card>
          <aside className="sidecol" aria-label="Details">
            <div className="panel stationpanel">
              {selected ? (
                <>
                  <button className="iconbtn closebtn" aria-label="Close station details" onClick={() => setSelected(null)}>
                    <X size={16} />
                  </button>
                  <StationInfo id={selected} now={day.hours[hour]} />
                </>
              ) : (
                <>
                  <div className="panelhead">
                    <MapPin size={16} aria-hidden="true" />
                    <strong>
                      Busiest stations, {fmtHour(hour)}–{fmtHour(hour + 1)}
                    </strong>
                  </div>
                  <ol className="toplist">
                    {busiest.map((x) => (
                      <li key={x.id}>
                        <button onClick={() => setSelected(x.id)}>
                          <span>{STATIONS[x.id].name}</span>
                          <strong>{n(x.b)}/h</strong>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <p className="muted small">Boardings on both lines. Tap a station here or on the map for details.</p>
                </>
              )}
            </div>
            <HourCard plan={plan} row={hourRow} band={hourBand} just={just} />
            <div className="panel findingpanel">
              <div className="panelhead">
                <Lightbulb size={16} aria-hidden="true" />
                <strong>Key finding</strong>
              </div>
              <p className="small">
                GMRC’s real timetable (18 May 2026) runs Red+Yellow every {plans.redYellow.summary.currentBestHeadway} min at best (4 trains/hour), not the 12 min first
                assumed. Off-peak gaps reach {plans.redYellow.summary.currentWorstHeadway} min; the last APMC departure is {APMC_DEPARTURES[APMC_DEPARTURES.length - 1]}. Blue
                runs every 7 min at peak, 10 off-peak (GMRC, Jul 2025).
              </p>
            </div>
          </aside>
        </div>

        {relief.length > 0 && (
          <section id="relief">
            <Card
              icon={Bus}
              title="Janmarg BRTS surge relief"
              sub="Hours when the metro is full even at the shortest headway its fleet allows. Extra Janmarg buses carry the overflow between the BRTS stops next to the crowded stretch."
              actions={<span className="badge">{relief.length} route{relief.length > 1 ? 's' : ''}</span>}
              className="reliefpanel"
            >
              <ReliefSection relief={relief} plans={plans} />
            </Card>
          </section>
        )}

        <section id="plan">
          <Card
            icon={Route}
            title={
              <>
                Headway recommendations · <LineDots sid={line} /> {SERVICES[line].name}
              </>
            }
            sub="Time band, today’s frequency and the recommended one, with the reason in English and Gujarati. Unchanged bands are hidden."
            actions={
              <>
                {just && (
                  <span className={`badge ${just.provider}`}>{busy ? 'updating…' : just.provider === 'gemini' ? 'Gemini · numbers checked' : 'Template text'}</span>
                )}
                <button className="primary" onClick={copyPlan} disabled={busy}>
                  {copied === 'ok' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy for control room'}
                </button>
              </>
            }
          >
            {just?.note && <p className="note">{just.note}</p>}
            <RecTable plan={plan} just={just} relief={relief} nowHour={nowHour} live={live} />
          </Card>
        </section>

        <div className="lowergrid">
          <Card icon={ChartColumn} title={`Demand vs capacity · ${SERVICES[line].name}`} sub="Bars: passengers on the busiest stretch each hour. Lines: what today’s and the recommended trains carry. Hover for numbers.">
            <DemandChart plan={plan} />
          </Card>
          <Card icon={TrainTrack} title="Fleet & service status" sub="Trainsets needed at the busiest hour against each line’s fleet." actions={<a href="#fleet" className="linkbtn">Fleet options</a>}>
            <FleetStatus plans={plans} fleets={fleets} />
          </Card>
        </div>

        <section id="fleet">
          <Card icon={TrainTrack} title="Fleet planning" sub="Trainsets each hour needs against what each line has. Change the fleet to try options; the whole plan updates.">
            <FleetPanel plans={plans} fleets={fleets} onChange={setFleets} reliefBuses={Math.max(0, ...relief.map((r) => r.buses))} />
          </Card>
        </section>

        <details className="panel assumptions">
          <summary>
            <Gauge size={16} aria-hidden="true" /> Data and assumptions
          </summary>
          <ul>
            {ASSUMPTIONS.map((a) => (
              <li key={a}>{a}</li>
            ))}
            <li>Event types in the search use typical crowd sizes and timings (assumptions); you choose the date.</li>
            <li>The fleet limits frequency: trainsets ÷ round-trip time sets the shortest headway (short-turn APMC⇄Motera where needed).</li>
            <li>Heavy rain threshold {MODEL.rainHeavyMm} mm.</li>
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
