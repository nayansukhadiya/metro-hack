// Real map: OpenStreetMap tiles + lines drawn through bundled station coordinates (src/stations-geo.json).
import 'leaflet/dist/leaflet.css'
import { latLngBounds, type LatLngTuple } from 'leaflet'
import { useRef } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet'
import { LINES, STATIONS, slug } from './network'
import { boardingsAt, heat, type HourData } from './mapUtil'
import StationInfo from './StationInfo'
import geo from './stations-geo.json'

const COORDS: Record<string, LatLngTuple> = Object.fromEntries(
  (geo as { name: string; lat: number; lng: number }[]).map((g) => [slug(g.name), [g.lat, g.lng] as LatLngTuple]),
)

export default function GeoMap({ now, maxB, onOffline }: { now: HourData; maxB: number; onOffline: () => void }) {
  const loaded = useRef(0)
  const failed = useRef(0)
  const bounds = latLngBounds(Object.values(COORDS)).pad(0.05)
  return (
    <MapContainer bounds={bounds} scrollWheelZoom={false} className="geomap">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
        eventHandlers={{
          tileload: () => {
            loaded.current++
          },
          tileerror: () => {
            // a few failed tiles is normal; none loading at all means we are offline
            if (++failed.current >= 3 && loaded.current === 0) onOffline()
          },
        }}
      />
      {LINES.map((l) => (
        <Polyline
          key={l.id}
          positions={l.stations.map((s) => COORDS[s.id]).filter(Boolean)}
          pathOptions={{ color: l.color, weight: 5, opacity: 0.9 }}
        />
      ))}
      {Object.keys(STATIONS)
        .filter((id) => COORDS[id])
        .map((id) => {
          const st = STATIONS[id]
          const t = boardingsAt(now, id) / maxB
          return (
            <CircleMarker
              key={id}
              center={COORDS[id]}
              radius={st.closed ? 4 : 4 + 9 * t + (st.interchange ? 2 : 0)}
              pathOptions={
                st.closed
                  ? { color: '#9aa0a6', weight: 1.5, fillColor: '#ffffff', fillOpacity: 1 }
                  : { color: st.interchange ? '#1b1d21' : '#ffffff', weight: st.interchange ? 2 : 1, fillColor: heat(t), fillOpacity: 0.95 }
              }
            >
              <Popup>
                <StationInfo id={id} now={now} />
              </Popup>
            </CircleMarker>
          )
        })}
    </MapContainer>
  )
}
