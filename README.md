# Headway Planner · Metro Hacks PS-04 "No Day Is an Average Day"

Takes tomorrow's calendar (holidays, festivals, events, rain forecast) for the Ahmedabad Metro
APMC ⇄ Mahatma Mandir corridor and recommends headway changes by time band, with a
plain-language justification for each change.

- `src/data.ts`: corridor, current timetable, Gujarat 2026 calendar, model assumptions
- `src/engine.ts`: hourly demand → busiest-link load → headway per band, fleet check, last train
- `src/justify.ts`: Gemini justification (numbers validated against the plan) with template fallback
- `api/justify.ts`: Vercel function that calls Gemini (key stays server-side)
- `src/weather.ts`: Open-Meteo rain forecast (free, no key)

## Run
    npm install
    npm run dev        # template justifications (no /api locally)

## Deploy (Vercel)
Import the repo as a Vite project. Add env var `GEMINI_API_KEY` (optional `GEMINI_MODEL`).
Without the key, the app still works and uses template justifications.
