// Rain forecast for Ahmedabad from Open-Meteo (free, no key). Falls back to manual input.
export async function fetchRainMm(date: string): Promise<number | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=23.03&longitude=72.58&daily=precipitation_sum&timezone=Asia%2FKolkata&start_date=${date}&end_date=${date}`
    const r = await fetch(url, { signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) return null
    const d = await r.json()
    const v = d?.daily?.precipitation_sum?.[0]
    return typeof v === 'number' ? Math.round(v) : null
  } catch {
    return null
  }
}
