// All seed data for the APMC ⇄ Mahatma Mandir corridor (Ahmedabad Metro, North–South).
// Every number here is either from a public source or a stated assumption — see ASSUMPTIONS.

export const STATIONS = [
  'APMC', 'Jivraj Park', 'Rajivnagar', 'Shreyas', 'Paldi', 'Gandhigram', 'Old High Court',
  'Usmanpura', 'Vijaynagar', 'Vadaj', 'Ranip', 'AEC', 'Sabarmati', 'Motera Stadium',
  'Koteshwar Road', 'Vishwakarma College', 'Tapovan Circle', 'Narmada Canal', 'Koba Circle',
  'Juna Koba', 'Koba Gam', 'GNLU', 'Raysan', 'Randesan', 'Dholakuva Circle', 'Infocity',
  'Sector-1', 'Sector 10A', 'Sachivalaya', 'Akshardham', 'Juna Sachivalaya', 'Sector-16',
  'Sector-24', 'Mahatma Mandir',
] as const

/** Current service, as headway (minutes) per hour band. Based on GMRC's published
 *  North–South frequency (~12 min peak) and service to 11 PM from 18 May 2026. */
export const CURRENT_HEADWAY: Record<'weekday' | 'saturday' | 'sunday', (h: number) => number | null> = {
  weekday: (h) => (h < 6 || h >= 23 ? null : (h >= 8 && h < 11) || (h >= 17 && h < 20) ? 12 : 15),
  saturday: (h) => (h < 6 || h >= 23 ? null : (h >= 8 && h < 11) || (h >= 17 && h < 20) ? 12 : 15),
  sunday: (h) => (h < 8 || h >= 22 ? null : 15),
}

export type HolidayKind = 'holiday' | 'festival-night' | 'low-travel'
export interface CalendarDay {
  date: string // YYYY-MM-DD
  name: string
  kind: HolidayKind
}

/** Gujarat GAD 2026 holiday list (Oct–Dec) + festival windows. Offline, editable. */
export const CALENDAR: CalendarDay[] = [
  { date: '2026-10-02', name: 'Gandhi Jayanti', kind: 'holiday' },
  ...[11, 12, 13, 14, 15, 16, 17, 18, 19].map((d, i) => ({
    date: `2026-10-${String(d).padStart(2, '0')}`,
    name: `Navratri night ${i + 1}`,
    kind: 'festival-night' as const,
  })),
  { date: '2026-10-20', name: 'Dussehra', kind: 'holiday' },
  { date: '2026-10-31', name: 'Sardar Patel Jayanti', kind: 'holiday' },
  { date: '2026-11-08', name: 'Diwali', kind: 'low-travel' },
  { date: '2026-11-09', name: 'Vikram Samvat New Year', kind: 'low-travel' },
  { date: '2026-11-11', name: 'Bhai Bij', kind: 'low-travel' },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti', kind: 'holiday' },
  { date: '2026-12-25', name: 'Christmas', kind: 'holiday' },
  { date: '2026-12-31', name: "New Year's Eve", kind: 'festival-night' },
]

export type EventType = 'stadium' | 'exam'
export interface CityEvent {
  id: string
  date: string
  type: EventType
  name: string
  attendance: number // stadium: spectators; exam: students
  start: number // hour, decimal (19.5 = 19:30)
  end: number // hour, can exceed 24
}

export const MODEL = {
  networkDailyJourneys: 200_000, // GMRC, routine days Aug 2026
  corridorShare: 0.3, // ~30% of riders use N–S corridor (GMRC via DeshGujarat, 2025)
  peakDirectionShare: 0.6,
  busiestLinkShare: 0.55,
  trainCapacityComfort: 450, // DPR planning capacity, 3-car
  trainCapacityCrush: 764, // DPR crush capacity
  minHeadway: 5, // assumed limit from terminals/turnback on this corridor
  maxHeadway: 15, // service standard: never worse than every 15 min
  maxHeadwayLowTravel: 20, // Diwali-type days only
  minLoadToStartEarly: 600,
  minLoadToExtend: 300,
  allowedHeadways: [5, 6, 8, 10, 12, 15, 20],
  dayFactor: { weekday: 1, saturday: 0.85, sunday: 0.77, holiday: 0.7, 'low-travel': 0.45 },
  stadiumMetroShare: 0.3, // fitted: IPL final 2026 added ~78k journeys ≈ 30% of 132k crowd
  stadiumEgressToApmcSide: 0.65,
  navratriJourneys: { weekday: 12_000, weekend: 18_000 }, // assumption
  rainHeavyMm: 30,
  rainUplift: 0.05, // GMRC counts on heavy-rain days stayed near normal
  cycleFullMin: 166, // APMC→Mahatma Mandir 78 min ×2 + 2×5 turnaround (GMRC timetable)
  cycleShortTurnMin: 74, // APMC⇄Motera 32 min ×2 + 2×5
  corridorFleet: 14, // assumed trainsets allocated to this corridor
  generatorShare: 0.4, // share of a normal weekday's trips made to/from listed generators (rest = background)
}

export const ASSUMPTIONS = [
  'Corridor demand = 2,00,000 network journeys/day (GMRC, Aug 2026) × 30% N–S share.',
  'Hourly shape: office/college peaks 8–11 AM and 5–8 PM on working days; flatter on holidays.',
  'Busiest link carries 60% (peak direction) × 55% of an hour’s corridor journeys.',
  'Train capacity 450 comfortable / 764 crush (Ahmedabad Metro DPR, 3-car).',
  'Stadium: 30% of spectators use the metro (fitted to the IPL final, 31 May 2026: +66% journeys).',
  'Navratri: 12k (weekday) / 18k (weekend) extra corridor journeys, out 7–10 PM, back 11 PM–2 AM.',
  'Heavy rain (≥30 mm): +5% only — GMRC counts on rain days stayed near normal.',
  'Generators (offices, colleges, hubs, industry, temples) set when and where trips happen; they carry 60% of a normal weekday, background trips on a flat curve fill each day to its total.',
  'Shortest headway 5 min; 14 trainsets for this corridor. Short-turn APMC⇄Motera when fleet runs short.',
]
