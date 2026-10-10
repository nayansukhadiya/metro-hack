// Control-room building blocks. Every number shown here comes from the plan, the flows model or the
// relief plan; nothing is invented in the UI.
import {
  ArrowRight,
  Bus,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudRain,
  Info,
  ListChecks,
  OctagonAlert,
  Plus,
  Ticket,
  TrainFront,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { BRTS, metroName, type Relief } from '../brts'
import type { CityEvent } from '../data'
import { fmtHour, type Band, type HourRow, type Plan } from '../engine'
import { changeKind, type Alert, type ChangeKind, type Severity } from './model'
import { bandLabel, linkLabel, type JustifyResult } from '../justify'
import { n } from '../mapUtil'
import { LINE, OPERATIONS, SERVICES, STATIONS, type ServiceId } from '../network'

const SIDS: ServiceId[] = ['redYellow', 'blue']
export const LineDots = ({ sid }: { sid: ServiceId }) => (
  <span className="linedots" aria-hidden="true">
    {SERVICES[sid].lines.map((l) => (
      <i key={l} style={{ background: LINE[l].color }} />
    ))}
  </span>
)

// ---------- scenario bar ----------
export interface Preset {
  label: string
  date: string
}

export function ScenarioBar({
  date,
  onDate,
  presets,
  matchOn,
  onMatch,
  eventsOpen,
  onEvents,
  eventCount,
  rain,
  rainSource,
  onRain,
}: {
  date: string
  onDate: (d: string) => void
  presets: Preset[]
  matchOn: boolean
  onMatch: () => void
  eventsOpen: boolean
  onEvents: () => void
  eventCount: number
  rain: number | null
  rainSource: 'forecast' | 'manual' | 'none'
  onRain: (v: number | null) => void
}) {
  return (
    <section className="scenario" aria-label="Scenario">
      <label className="field datefield">
        <span>Plan for</span>
        <span className="inputwrap">
          <CalendarDays size={16} aria-hidden="true" />
          <input type="date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
        </span>
      </label>
      <div className="presets" role="group" aria-label="Scenario presets">
        {presets.map((p) => (
          <button key={p.label} className={p.date === date ? 'on' : ''} aria-pressed={p.date === date} onClick={() => onDate(p.date)}>
            {p.label}
          </button>
        ))}
      </div>
      <span className="vsep" aria-hidden="true" />
      <div className="eventbtns">
        <button className={`primary ${matchOn ? 'active' : ''}`} aria-pressed={matchOn} onClick={onMatch}>
          {matchOn ? <CircleCheck size={16} aria-hidden="true" /> : <Ticket size={16} aria-hidden="true" />}
          Cricket match at Motera
        </button>
        <button className={eventsOpen ? 'on' : ''} aria-expanded={eventsOpen} onClick={onEvents}>
          <Plus size={16} aria-hidden="true" /> Other event{eventCount ? <span className="tcount">{eventCount}</span> : null}
        </button>
      </div>
      <label className="field rainfield">
        <span>Rain (mm)</span>
        <span className="inputwrap">
          <CloudRain size={16} aria-hidden="true" />
          <input
            type="number"
            min={0}
            value={rain ?? ''}
            placeholder="—"
            onChange={(e) => onRain(e.target.value === '' ? null : Number(e.target.value))}
          />
        </span>
        <small>{rainSource === 'forecast' ? 'Open-Meteo forecast' : rainSource === 'manual' ? 'entered by hand' : 'no forecast'}</small>
      </label>
    </section>
  )
}

// ---------- KPIs ----------
function Kpi({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone,
  meter,
}: {
  icon: LucideIcon
  label: string
  value: string
  unit?: string
  hint: string
  tone?: 'crit' | 'warn' | 'ok'
  meter?: number
}) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span className="kpiicon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="kpibody">
        <span className="kpilabel">{label}</span>
        <span className="kpivalue">
          {value}
          {unit && <small>{unit}</small>}
        </span>
        <span className="kpihint">{hint}</span>
        {meter != null && (
          <span className="meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.round(meter * 100))}%` }} />
          </span>
        )}
      </div>
    </div>
  )
}

export function Kpis({ plan, gapFills, demandChanges }: { plan: Plan; gapFills: number; demandChanges: number }) {
  const s = plan.summary
  const later = !!s.lastTrain && s.lastTrain > s.currentLastTrain
  const changes = plan.bands.filter((b) => b.change !== 'same').length
  return (
    <div className="kpis">
      <Kpi icon={Users} label="Peak demand, busiest stretch" value={n(s.peakLoad)} unit="/h" hint={`${fmtHour(s.peakHour)} · ${linkLabel(s.peakLink)}`} />
      <Kpi
        icon={ListChecks}
        label="Recommended changes"
        value={String(changes)}
        unit=" bands"
        hint={changes ? `${demandChanges} demand-driven · ${gapFills} timetable gaps` : 'keep today’s timetable'}
        tone={demandChanges ? 'warn' : undefined}
      />
      <Kpi
        icon={Clock}
        label="Last train"
        value={s.lastTrain ? fmtHour(s.lastTrain) : '—'}
        hint={later ? `usually ${fmtHour(s.currentLastTrain)}: extend service` : 'as usual'}
        tone={later ? 'warn' : undefined}
      />
      <Kpi
        icon={TrainFront}
        label="Trainsets at peak"
        value={`${s.peakTrainsNeeded}`}
        unit={` / ${s.fleet}`}
        hint={s.fleetLimited ? `fleet caps trains at every ${s.fleetFloor} min` : s.shortTurn ? `short-turn ${OPERATIONS[plan.service].shortTurn}` : `${Math.max(0, s.fleet - s.peakTrainsNeeded)} spare`}
        tone={s.fleetLimited ? 'crit' : undefined}
        meter={s.peakTrainsNeeded / s.fleet}
      />
      <Kpi
        icon={Bus}
        label="Overflow to Janmarg"
        value={s.peakOverflow ? n(s.peakOverflow) : '0'}
        unit={s.peakOverflow ? '/h' : undefined}
        hint={s.peakOverflow ? `even at ${s.fleetFloor}-min trains` : 'metro carries everyone'}
        tone={s.peakOverflow ? 'crit' : 'ok'}
      />
      <Kpi
        icon={TriangleAlert}
        label="Left behind on today’s timetable"
        value={n(s.leftBehindCurrent)}
        hint="if nothing changes"
        tone={s.leftBehindCurrent > 500 ? 'warn' : undefined}
      />
    </div>
  )
}

// ---------- alerts ----------
const SEV: Record<Severity, { icon: LucideIcon; label: string }> = {
  critical: { icon: OctagonAlert, label: 'Critical' },
  warning: { icon: TriangleAlert, label: 'Warning' },
  info: { icon: Info, label: 'Info' },
}

const ALERTS_SHOWN = 4

export function Alerts({ alerts }: { alerts: Alert[] }) {
  const [all, setAll] = useState(false)
  if (!alerts.length)
    return (
      <div className="alerts">
        <div className="alert ok">
          <CircleCheck size={18} aria-hidden="true" />
          <div>
            <strong>All clear</strong>
            <span>Both lines carry the day on their usual timetable; no fleet or capacity problems.</span>
          </div>
        </div>
      </div>
    )
  return (
    <div className="alerts" role="list" aria-label="Operational alerts">
      {(all ? alerts : alerts.slice(0, ALERTS_SHOWN)).map((a, i) => {
        const S = SEV[a.sev]
        const body = (
          <>
            <S.icon size={18} aria-hidden="true" />
            <div>
              <span className="sevlabel">{S.label}</span>
              <strong>{a.title}</strong>
              <span>{a.text}</span>
            </div>
            {a.href && <ArrowRight size={15} aria-hidden="true" className="go" />}
          </>
        )
        return a.href ? (
          <a key={i} href={a.href} className={`alert ${a.sev}`} role="listitem">
            {body}
          </a>
        ) : (
          <div key={i} className={`alert ${a.sev}`} role="listitem">
            {body}
          </div>
        )
      })}
      {alerts.length > ALERTS_SHOWN && (
        <button className="linkbtn alertsmore" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer alerts' : `Show ${alerts.length - ALERTS_SHOWN} more alert${alerts.length - ALERTS_SHOWN > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ---------- change pill ----------
const CHANGE_LABEL: Record<ChangeKind, string> = {
  demand: 'More trains',
  gap: 'Fill gap',
  fewer: 'Fewer trains',
  extend: 'Extend service',
  'start-early': 'Start early',
  same: 'Keep',
}
export function ChangePill({ b }: { b: Band }) {
  const k = changeKind(b)
  const delta = b.currentHeadway && b.recommendedHeadway ? b.recommendedHeadway - b.currentHeadway : null
  return (
    <span className={`pillc ${k}`}>
      {CHANGE_LABEL[k]}
      {delta ? <small>{delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`} min</small> : null}
    </span>
  )
}

// ---------- the slider hour, for the selected line ----------
export function HourCard({ plan, row, band, just }: { plan: Plan; row: HourRow | undefined; band: Band | undefined; just: JustifyResult | null }) {
  const text = band ? just?.lines.find((l) => l.band === bandLabel(band)) : undefined
  return (
    <div className="panel hourcard">
      <div className="panelhead">
        <Clock size={16} aria-hidden="true" />
        <strong>
          {row ? `${fmtHour(row.hour)}–${fmtHour(row.hour + 1)}` : 'This hour'} · <LineDots sid={plan.service} /> {SERVICES[plan.service].name}
        </strong>
        {band && <ChangePill b={band} />}
      </div>
      {row && (row.currentHeadway || row.recommendedHeadway) ? (
        <>
          <div className="hwcompare">
            <div>
              <span>Today</span>
              <strong>{row.currentHeadway ? `${row.currentHeadway} min` : 'no train'}</strong>
            </div>
            <ArrowRight size={18} aria-hidden="true" />
            <div className={row.recommendedHeadway !== row.currentHeadway ? 'rec' : ''}>
              <span>Recommended</span>
              <strong>{row.recommendedHeadway ? `${row.recommendedHeadway} min` : 'no train'}</strong>
            </div>
          </div>
          <p className="muted small">
            {n(row.load)} passengers/h on {linkLabel(row.link)}
            {row.overflow > 0 ? ` · ${n(row.overflow)}/h over capacity` : ''} · {row.trainsNeeded} trainsets{row.shortTurnHour ? ' (short-turn)' : ''}
          </p>
          {text && band?.change !== 'same' && <p className="small">{text.en}</p>}
        </>
      ) : (
        <p className="muted small">No service planned on this line in this hour.</p>
      )}
    </div>
  )
}

// ---------- recommendations table ----------
export function RecTable({ plan, just, relief, nowHour, live }: { plan: Plan; just: JustifyResult | null; relief: Relief[]; nowHour: number; live: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const rows = showAll ? plan.bands : plan.bands.filter((b) => b.change !== 'same')
  const hidden = plan.bands.length - plan.bands.filter((b) => b.change !== 'same').length
  return (
    <div className="rectable">
      <div className="rt-head" role="row">
        <span>Time</span>
        <span>Line</span>
        <span>Busiest stretch</span>
        <span>Today</span>
        <span>Plan</span>
        <span>Change</span>
        <span>Reason</span>
      </div>
      {!rows.length && <p className="muted rt-empty">No changes on this line: keep today’s timetable.</p>}
      {rows.map((b) => {
        const k = changeKind(b)
        const text = just?.lines.find((l) => l.band === bandLabel(b))
        const isNow = live && nowHour >= b.from && nowHour < b.to
        const bus = relief.some((r) => r.service === plan.service && r.from < b.to && r.to > b.from)
        const expanded = open === b.from
        return (
          <div key={b.from} className={`rt-row ${k} ${isNow ? 'now' : ''}`} role="row">
            <span className="rt-time">
              {bandLabel(b)}
              {isNow && <em className="tagnow">now</em>}
              {bus && <em className="tagbus">+ Janmarg</em>}
            </span>
            <span className="rt-line">
              <LineDots sid={plan.service} /> {SERVICES[plan.service].name}
            </span>
            <span className="rt-link">{linkLabel(b.link)}</span>
            <span className="rt-num muted">{b.currentHeadway ? `${b.currentHeadway} min` : '—'}</span>
            <span className="rt-num rt-rec">{b.recommendedHeadway ? `${b.recommendedHeadway} min` : '—'}</span>
            <span>
              <ChangePill b={b} />
            </span>
            <span className="rt-why">
              {b.change === 'same' ? (
                <span className="muted">
                  {n(b.peakLoad)}/h fits {n(b.currentCapacity)}/h
                </span>
              ) : (
                <>
                  <span className={expanded ? '' : 'clamp'}>{text?.en ?? '…'}</span>
                  {expanded && text?.gu && <span className="gu">{text.gu}</span>}
                  <button className="linkbtn" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.from)}>
                    {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                    {expanded ? 'Less' : 'Full reason · ગુજરાતી'}
                  </button>
                </>
              )}
            </span>
          </div>
        )
      })}
      {hidden > 0 && (
        <button className="linkbtn rt-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide unchanged bands' : `Show ${hidden} unchanged band${hidden > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  )
}

// ---------- Janmarg relief ----------
export function ReliefSection({ relief, plans }: { relief: Relief[]; plans: Record<ServiceId, Plan> }) {
  return (
    <div className="relieflist">
      {relief.map((r) => {
        const inter = r.route.filter((id) => BRTS[id].interchange).map((id) => BRTS[id].name)
        const sameHour = relief.filter((x) => x.service === r.service && x.from === r.from)
        const covered = Math.min(r.overflow, sameHour.reduce((a, x) => a + x.carried, 0))
        return (
          <article key={`${r.service}${r.from}${r.metroTo}`} className="reliefitem">
            <header>
              <span className="rtime">
                {fmtHour(r.from)}–{fmtHour(r.to)}
              </span>
              <span className="rline">
                <LineDots sid={r.service} /> {SERVICES[r.service].name}
              </span>
              <span className="rbuses">
                +{r.buses}
                <small> buses/h</small>
              </span>
            </header>
            <div className="rseg">
              <span className="muted small">Overloaded metro stretch</span>
              <strong>{linkLabel(r.link)}</strong>
              <span className="muted small">
                {n(r.overflow)}/h over capacity at {plans[r.service].summary.fleetFloor}-min trains
              </span>
            </div>
            <div className="rroute">
              <span className="muted small">Janmarg route ({r.route.length - 1} stops)</span>
              <div className="routeviz" aria-hidden="true">
                <i className="end" />
                <span />
                <i className="end" />
              </div>
              <div className="routeends">
                <strong>{BRTS[r.route[0]].name}</strong>
                <strong>{BRTS[r.route[r.route.length - 1]].name}</strong>
              </div>
              <span className="muted small">
                for metro {metroName(r.metroFrom)} → {metroName(r.metroTo)}
                {inter.length ? ` · via ${inter.join(', ')}` : ''}
              </span>
            </div>
            <div className="rcover">
              <span className="muted small">
                Takes {n(r.carried)} of {n(r.overflow)}/h{sameHour.length > 1 ? ` (with the other corridor: ${n(covered)})` : ''}
              </span>
              <span className="meter" aria-hidden="true">
                <i style={{ width: `${Math.round((r.carried / r.overflow) * 100)}%` }} />
              </span>
              <span className="small">Why: {r.why}</span>
            </div>
          </article>
        )
      })}
      <p className="muted small">Janmarg bus 80 passengers; at most 30 extra buses/hour per corridor (assumptions). Relief runs only over operating corridors.</p>
    </div>
  )
}

// ---------- compact fleet & service status ----------
export function FleetStatus({ plans, fleets }: { plans: Record<ServiceId, Plan>; fleets: Record<ServiceId, number> }) {
  return (
    <div className="fleetstatus">
      {SIDS.map((sid) => {
        const s = plans[sid].summary
        const spare = fleets[sid] - s.peakTrainsNeeded
        return (
          <div key={sid} className="fs-line">
            <div className="fs-top">
              <span>
                <LineDots sid={sid} /> {SERVICES[sid].name}
              </span>
              <strong>
                {s.peakTrainsNeeded} / {fleets[sid]}
              </strong>
            </div>
            <span className={`meter ${s.fleetLimited ? 'crit' : ''}`} aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.round((s.peakTrainsNeeded / fleets[sid]) * 100))}%` }} />
            </span>
            <div className="fs-facts">
              <span className={s.fleetLimited ? 'crit' : spare > 0 ? 'ok' : ''}>
                {s.fleetLimited ? (
                  <>
                    <CircleAlert size={13} aria-hidden="true" /> fleet-limited, every {s.fleetFloor} min at best
                  </>
                ) : (
                  <>
                    <CircleCheck size={13} aria-hidden="true" /> {spare} spare at the busiest hour
                  </>
                )}
              </span>
              <span>
                Last train {s.lastTrain ? fmtHour(s.lastTrain) : '—'}
                {s.lastTrain && s.lastTrain > s.currentLastTrain ? ` (usually ${fmtHour(s.currentLastTrain)})` : ''}
              </span>
              {s.shortTurn && <span>short-turn {OPERATIONS[sid].shortTurn}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- event chips for the selected day ----------
export function DayChips({ ctx, dayEvents, onRemove }: { ctx: Plan['ctx']; dayEvents: CityEvent[]; onRemove: (id: string) => void }) {
  return (
    <div className="chips daychips">
      <span className="chip">{ctx.dayType}</span>
      {ctx.calendar.map((c) => (
        <span key={c.name} className={`chip ${c.kind}`}>
          {c.name}
        </span>
      ))}
      {dayEvents.map((e) => (
        <span key={e.id} className="chip event">
          {e.name} · {n(e.attendance)} · {fmtHour(e.start)}–{fmtHour(e.end)}
          {e.station ? ` · ${STATIONS[e.station]?.name ?? ''}` : ''}
          <button className="iconbtn" aria-label={`Remove ${e.name}`} onClick={() => onRemove(e.id)}>
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
