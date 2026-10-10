# Headway Planner · Metro Hacks PS-04 "No Day Is an Average Day"

Takes tomorrow's calendar (holidays, festivals, events, rain forecast) for the whole Ahmedabad Metro
(Blue, Red, Yellow, Violet) and recommends headway changes per line and time band, with a plain-language
justification for each change. When even 5-minute trains cannot carry the crowd, it hands the overflow to
Janmarg BRTS with extra buses on the corridors next to the overloaded stretch.

- `src/network.ts`: lines, stations (km from GMRC run times), real current timetables, station weights, fleet
- `src/generators.ts`: offices, colleges, hubs, industry, temples with arrive/leave timings and day rules
- `src/flows.ts`: hourly boardings, alightings and link loads per line (generators + background, gravity destinations, events)
- `src/engine.ts`: busiest link per hour → headway per band, fleet check, last train, overflow
- `src/eventCatalog.ts`: searchable event types (cricket, concerts, Kankaria Carnival, exams…) with typical crowds and timings
- `src/ui/`: calendar + event search, fleet panel (trainsets per hour, editable fleet, options), shared cards
- `src/brts.ts`: Janmarg network (from the Janmarg route map), metro ⇄ BRTS walking links, surge relief routing
- `src/justify.ts`: Gemini justification (numbers validated against the plan) with template fallback
- `api/justify.ts`: Vercel function that calls Gemini (key stays server-side)
- `src/weather.ts`: Open-Meteo rain forecast (free, no key)
- Map views: generated schematic, OpenStreetMap (Leaflet, needs `src/stations-geo.json`), Janmarg BRTS

## Vercel environment variables
| Name | Required | Value |
|---|---|---|
| `GEMINI_API_KEY` | for Gemini text | Google AI Studio API key |
| `GEMINI_MODEL` | no | defaults to `gemini-2.5-flash` |

Redeploy after adding them. Without the key the app uses template text (English + Gujarati).

## Run
    npm install
    npm run dev                        # template justifications (no /api locally)
    npx tsx scripts/sanity.ts          # model checks, exits 1 on failure
    npx tsx scripts/fetch-stations.ts  # one-time: station coordinates for the real map

## Deploy (Vercel)
Import the repo as a Vite project and add the environment variables above.
