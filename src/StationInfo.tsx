import { Building, Bus, Factory, Flower2, Footprints, GraduationCap, Landmark, TrainFront, Zap } from 'lucide-react'
import { BRTS, brtsFor } from './brts'
import { fmtHour } from './engine'
import { GENERATORS, daysLabel, timingLabel, type GeneratorType } from './generators'
import { SERVICE_OF, boardingsAt, n, type HourData } from './mapUtil'
import { LINE, STATIONS, kindLabel } from './network'

const GEN_ICON: Record<GeneratorType, typeof Bus> = {
  govt: Landmark,
  office: Building,
  it: Zap,
  college: GraduationCap,
  hub: TrainFront,
  industry: Factory,
  temple: Flower2,
}

/** Station details shared by the network side panel and the map popup. */
export default function StationInfo({ id, now }: { id: string; now: HourData }) {
  const st = STATIONS[id]
  const services = [...new Set(st.lines.map((l) => SERVICE_OF[l]))]
  const kind = kindLabel(id)
  const gens = GENERATORS.filter((g) => g.station === st.name)
  const board = boardingsAt(now, id)
  const alight = services.reduce((a, s) => a + (now[s].alightings[id] ?? 0), 0)
  const net = board - alight
  const drivers = [
    ...services.flatMap((s) => now[s].stationDrivers[id] ?? []),
    ...services.flatMap((s) => now[s].drivers.filter((d) => d.startsWith('office') || d.includes('holiday') || d.includes('rain'))),
  ]
  return (
    <div className="stninfo">
      <div className="stnhead">
        <strong className="stnname">{st.name}</strong>
        <div className="chips">
          {st.lines.map((l) => (
            <span key={l} className="chip">
              <i className="sw" style={{ background: LINE[l].color }} /> {LINE[l].name.split(' (')[0]}
            </span>
          ))}
          {st.interchange && <span className="chip">Interchange</span>}
          {st.closed && <span className="chip warn">Closed: work in progress</span>}
        </div>
        {kind && <span className="muted small">{kind}</span>}
      </div>

      <div className="stnmetrics" aria-label={`${fmtHour(now.blue.hour)}–${fmtHour(now.blue.hour + 1)}`}>
        <div>
          <span>Boardings</span>
          <strong>{st.closed ? '—' : `${n(board)}/h`}</strong>
        </div>
        <div>
          <span>Alightings</span>
          <strong>{st.closed ? '—' : `${n(alight)}/h`}</strong>
        </div>
        <div>
          <span>Net flow</span>
          <strong>{st.closed ? '—' : `${net >= 0 ? '+' : '−'}${n(Math.abs(net))}/h`}</strong>
        </div>
      </div>

      {gens.length > 0 && (
        <div className="stnsec">
          <span className="sechead">Trip generators nearby</span>
          <ul className="gens">
            {gens.map((g) => {
              const Icon = GEN_ICON[g.type]
              return (
                <li key={g.id}>
                  <Icon size={15} aria-hidden="true" />
                  <div>
                    <strong>{g.name}</strong>
                    <span className="muted">
                      {timingLabel(g)} · {daysLabel(g)}
                      {g.note && g.type !== 'hub' ? ` · ${g.note}` : ''}
                    </span>
                  </div>
                  <span className={`tag ${g.source}`}>{g.source}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {brtsFor(id).map((l) => (
        <div key={l.brts} className="stnsec brtslink">
          <Footprints size={15} aria-hidden="true" />
          <div>
            <span className="sechead">Walkable Janmarg stop</span>
            <strong>{BRTS[l.brts].name}</strong>
          </div>
          <span className={`tag ${l.source === 'same name' ? 'verified' : 'assumed'}`}>{l.source}</span>
        </div>
      ))}

      {drivers.length > 0 && (
        <div className="stnsec">
          <span className="sechead">Why it is busy this hour</span>
          <ul className="drivers">
            {[...new Set(drivers)].map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
