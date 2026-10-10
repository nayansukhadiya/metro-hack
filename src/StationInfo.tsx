import { BRTS, brtsFor } from './brts'
import { fmtHour } from './engine'
import { GENERATORS, daysLabel, timingLabel } from './generators'
import { SERVICE_OF, boardingsAt, n, type HourData } from './mapUtil'
import { LINE, STATIONS, kindLabel } from './network'

/** Station details shared by the schematic panel and the map popup. */
export default function StationInfo({ id, now }: { id: string; now: HourData }) {
  const st = STATIONS[id]
  const services = [...new Set(st.lines.map((l) => SERVICE_OF[l]))]
  const kind = kindLabel(id)
  const gens = GENERATORS.filter((g) => g.station === st.name)
  const alight = services.reduce((a, s) => a + (now[s].alightings[id] ?? 0), 0)
  const drivers = [
    ...(kind ? [kind] : []),
    ...services.flatMap((s) => now[s].stationDrivers[id] ?? []),
    ...services.flatMap((s) => now[s].drivers.filter((d) => d.startsWith('office') || d.includes('holiday') || d.includes('rain'))),
  ]
  return (
    <div className="stninfo">
      <strong>{st.name}</strong>
      <div className="chips">
        {st.lines.map((l) => (
          <span key={l} className="chip" style={{ borderColor: LINE[l].color }}>
            <i className="sw" style={{ background: LINE[l].color }} /> {LINE[l].name}
          </span>
        ))}
        {st.closed && <span className="chip">Closed: work in progress</span>}
      </div>
      <p>
        <strong>{st.closed ? '—' : n(boardingsAt(now, id))}</strong> boardings · <strong>{st.closed ? '—' : n(alight)}</strong> alightings,{' '}
        {fmtHour(now.blue.hour)}–{fmtHour(now.blue.hour + 1)}
      </p>
      {brtsFor(id).map((l) => (
        <p key={l.brts} className="brtslink">
          🚌 Janmarg <strong>{BRTS[l.brts].name}</strong> is a short walk · <span className={`tag ${l.source === 'same name' ? 'verified' : 'assumed'}`}>{l.source}</span>
        </p>
      ))}
      {gens.length > 0 && (
        <ul className="gens">
          {gens.map((g) => (
            <li key={g.id}>
              <span className={`tag ${g.source}`}>{g.source}</span> <strong>{g.name}</strong>
              <br />
              <span className="muted">
                {timingLabel(g)} · {daysLabel(g)}
                {g.note && g.type !== 'hub' ? ` · ${g.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {drivers.length > 0 && (
        <ul>
          {[...new Set(drivers)].map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
