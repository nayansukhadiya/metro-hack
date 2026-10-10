// Vercel serverless function: POST /api/justify
// Turns plan facts into plain-language justifications. Set GEMINI_API_KEY in Vercel env settings.
// The key never reaches the browser. Numbers are re-checked on the client against the facts.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(503).json({ error: 'GEMINI_API_KEY not set' })

  const facts = typeof req.body === 'string' ? JSON.parse(req.body).facts : req.body?.facts
  if (!facts?.changes?.length) return res.status(400).json({ error: 'no changes' })

  const prompt = `You write for a metro control-room operator in Ahmedabad.
For EACH item in "changes", write one short justification (max 2 sentences) the operator can act on.
Rules:
- Use ONLY the facts given. Never invent numbers, times, stations or events.
- Use Western digits (0-9) only, in both languages.
- "en": plain English. "gu": the same meaning in simple Gujarati.
- "band": copy the band string exactly.
Return JSON: {"lines":[{"band":"...","en":"...","gu":"..."}]} in the same order as "changes".

FACTS:
${JSON.stringify(facts)}`

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) return res.status(502).json({ error: `Gemini ${r.status}` })
    const data = await r.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(text)
    return res.status(200).json({ lines: parsed.lines ?? [] })
  } catch (e: any) {
    return res.status(504).json({ error: e?.name === 'AbortError' ? 'timeout' : 'failed' })
  }
}
