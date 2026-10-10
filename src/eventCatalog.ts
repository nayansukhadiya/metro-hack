// Searchable event types for the calendar. Crowd sizes, timings and metro shares are typical values
// (ASSUMPTIONS, editable); you choose the date. None of these is a published fixture.
import type { CityEvent, EventType } from './data'

export interface EventTemplate {
  id: string
  name: string
  type: EventType
  station?: string // venue metro station (crowd events)
  attendance: number
  start: number
  end: number
  metroShare?: number
  keywords: string
  note: string
  /** recurring dates worth suggesting (assumed) */
  suggestedDates?: string[]
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'ipl-evening', name: 'IPL evening match · Narendra Modi Stadium', type: 'stadium', station: 'motera-stadium',
    attendance: 110000, start: 19.5, end: 23.25, keywords: 'cricket ipl t20 motera stadium gujarat titans',
    note: '7:30 PM start; metro share fitted to the IPL final, 31 May 2026',
  },
  {
    id: 'odi', name: 'ODI day-night international · Narendra Modi Stadium', type: 'stadium', station: 'motera-stadium',
    attendance: 100000, start: 14, end: 22, keywords: 'cricket odi india international motera stadium one day', note: '2 PM start, ends about 10 PM',
  },
  {
    id: 't20i', name: 'T20 international · Narendra Modi Stadium', type: 'stadium', station: 'motera-stadium',
    attendance: 110000, start: 19, end: 22.5, keywords: 'cricket t20 india international motera stadium', note: '7 PM start',
  },
  {
    id: 'test', name: 'Test match day · Narendra Modi Stadium', type: 'stadium', station: 'motera-stadium',
    attendance: 40000, start: 9.5, end: 17, keywords: 'cricket test match day motera stadium', note: '9:30 AM to 5 PM',
  },
  {
    id: 'concert', name: 'Concert · Narendra Modi Stadium', type: 'stadium', station: 'motera-stadium',
    attendance: 90000, start: 19, end: 22.5, keywords: 'concert music show live coldplay motera stadium', note: 'evening show',
  },
  {
    id: 'kankaria', name: 'Kankaria Carnival evening · Kankaria Lake', type: 'stadium', station: 'kankaria-east',
    attendance: 80000, start: 17, end: 22, metroShare: 0.15, keywords: 'kankaria carnival lake festival december christmas',
    note: 'held 25–31 Dec most years (assumed); evening crowds', suggestedDates: ['2026-12-25', '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'],
  },
  {
    id: 'riverfront', name: 'Riverfront event / flower show · Sabarmati Riverfront', type: 'stadium', station: 'gandhigram',
    attendance: 40000, start: 10, end: 21, metroShare: 0.15, keywords: 'riverfront flower show sabarmati event kite festival', note: 'all-day visitors, nearest metro Gandhigram',
  },
  {
    id: 'gmdc', name: 'Garba night · GMDC ground', type: 'stadium', station: 'gujarat-university',
    attendance: 30000, start: 20, end: 24.5, metroShare: 0.2, keywords: 'garba navratri gmdc dandiya festival', note: 'late night, nearest metro Gujarat University',
  },
  {
    id: 'mahatma-mandir', name: 'Summit / convention · Mahatma Mandir', type: 'stadium', station: 'mahatma-mandir',
    attendance: 15000, start: 10, end: 18, metroShare: 0.25, keywords: 'vibrant gujarat summit convention mahatma mandir gandhinagar expo', note: 'daytime delegates and visitors',
  },
  {
    id: 'gift', name: 'Conference · GIFT City', type: 'stadium', station: 'gift-city',
    attendance: 8000, start: 9.5, end: 18, metroShare: 0.3, keywords: 'gift city conference fintech ifsc', note: 'office-hours event',
  },
  {
    id: 'marathon', name: 'City marathon (early morning) · Riverfront', type: 'stadium', station: 'old-high-court',
    attendance: 20000, start: 6, end: 11, metroShare: 0.2, keywords: 'marathon run race riverfront morning', note: 'runners arrive before the first train: may need an early start',
  },
  {
    id: 'gseb', name: 'GSEB board exam day', type: 'exam', attendance: 60000, start: 10, end: 13.25,
    keywords: 'exam board gseb ssc hsc school students', note: 'students travel 7–9 AM and 1–3 PM',
  },
  {
    id: 'gu-exam', name: 'University semester exams', type: 'exam', attendance: 25000, start: 10, end: 13,
    keywords: 'exam university semester college gtu gujarat university', note: 'students travel 7–9 AM and 1–3 PM',
  },
  {
    id: 'gpsc', name: 'Recruitment exam (GPSC / UPSC prelims)', type: 'exam', attendance: 40000, start: 10, end: 13,
    keywords: 'exam gpsc upsc recruitment government job prelims', note: 'candidates travel 7–9 AM and 1–3 PM',
  },
]

export function fromTemplate(t: EventTemplate, date: string): CityEvent {
  return {
    id: crypto.randomUUID(),
    date,
    type: t.type,
    name: t.name.split(' · ')[0],
    attendance: t.attendance,
    start: t.start,
    end: t.end,
    ...(t.station ? { station: t.station } : {}),
    ...(t.metroShare != null ? { metroShare: t.metroShare } : {}),
  }
}

export function searchTemplates(q: string): EventTemplate[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return EVENT_TEMPLATES
  return EVENT_TEMPLATES.filter((t) => {
    const hay = `${t.name} ${t.keywords}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
