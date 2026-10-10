import { fmtHour } from './engine'
import { SERVICE_OF, boardingsAt, n, type HourData } from './mapUtil'
import { LINE, STATIONS, kindLabel } from './network'

/** Station details shared by the schematic panel and the map popup. */
export default function StationInfo({ id, now }: { id: string; now: HourData }) {
  const st = STATIONS[id]
  const services = [...new Set(st.lines.map((l) => SERVICE_OF[l]))]
  const kind = kindLabel(id)
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
        <strong>{st.closed ? '—' : n(boardingsAt(now, id))}</strong> boardings, {fmtHour(now.blue.hour)}–{fmtHour(now.blue.hour + 1)}
      </p>
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
