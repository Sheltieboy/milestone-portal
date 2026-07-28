// CIRCLE assessment — AI analysis (serverless).
// Interprets the LICENSED CICS scores; never invents questionnaire items,
// scores, or CIRCLE strategies. The API key lives only in this function's env
// (ANTHROPIC_API_KEY on the Netlify site) — never in the browser. The caller's
// Supabase session is verified so the key can't be used anonymously.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const SUPABASE_URL = 'https://kjbhnsikjymobudmlgmy.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqYmhuc2lranltb2J1ZG1sZ215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjY4NDgsImV4cCI6MjA5NDM0Mjg0OH0.65RefY6qK1ohQqRpjuFi75CNBip8P_Qy2owyKJKtWmI'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (statusCode, obj) => ({ statusCode, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(obj) })

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { area: { type: 'string' }, detail: { type: 'string' } }, required: ['area', 'detail'] } },
    development: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { area: { type: 'string' }, detail: { type: 'string' } }, required: ['area', 'detail'] } },
    patterns: { type: 'array', items: { type: 'string' } },
    priorities: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { item: { type: 'string' }, why: { type: 'string' }, smart_goal: { type: 'string' }, review_weeks: { type: 'integer' }, evidence: { type: 'string' } }, required: ['item', 'why', 'smart_goal', 'review_weeks', 'evidence'] } },
  },
  required: ['summary', 'strengths', 'development', 'patterns', 'priorities'],
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json(503, { error: 'AI is not configured yet (missing ANTHROPIC_API_KEY).' })

  // Verify the caller is a signed-in Supabase user
  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { error: 'Please sign in.' })
  try {
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } })
    if (!uRes.ok) return json(401, { error: 'Your session is invalid — sign in again.' })
  } catch (_) {
    return json(401, { error: 'Could not verify your session.' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') } catch (_) { return json(400, { error: 'Bad request.' }) }
  const { instrument, subject, overallMean, sections, developItems } = payload
  if (!Array.isArray(sections) || !sections.length) return json(400, { error: 'Missing assessment scores.' })

  const system = `You support a Scottish ASN (Additional Support Needs) practitioner interpreting a completed ${instrument || 'CIRCLE'} assessment. Follow these rules exactly:
- Base every statement ONLY on the numeric ratings provided. Never invent items, scores, or questionnaire content.
- The ratings are the LICENSED assessment result. Everything you write is AI interpretation of those ratings — never present it as part of the licensed scoring.
- Do NOT invent or name specific CIRCLE strategies or interventions. Recommended strategies come from the organisation's licensed CIRCLE materials, retrieved separately. You may frame the type of area to focus on and write SMART goals, but do not fabricate named CIRCLE strategies.
- Rating scale: 4 = environment strongly supports participation (exceptional), 3 = supports participation (effective), 2 = interferes (limited support), 1 = strongly interferes. Items rated 2 or below are development areas.
- Be concise, practical, encouraging, and specific to the ratings. British English.`

  const userMsg = `Assessment: ${instrument || 'CICS'} for "${subject || 'a classroom'}".
Overall mean rating: ${overallMean} out of 4.
Section means and item ratings:
${sections.map((s) => `- ${s.name} (mean ${s.mean}): ${(s.items || []).map((i) => `${i.name}=${i.rating}`).join(', ')}`).join('\n')}
Development areas (rated 2 or below): ${developItems && developItems.length ? developItems.map((d) => `${d.name} (${d.rating})`).join(', ') : 'none'}.

Give a grounded interpretation: an overall summary, key strengths, areas for development, cross-domain patterns, and prioritised SMART action plans (each with why it matters, a SMART goal, a review timeframe in weeks, and evidence that would show improvement).`

  try {
    const aRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 3000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!aRes.ok) {
      const t = await aRes.text().catch(() => '')
      return json(502, { error: 'The AI request failed.', detail: t.slice(0, 300) })
    }
    const data = await aRes.json()
    if (data.stop_reason === 'refusal') return json(200, { error: 'The AI declined to analyse this content.' })
    const textBlock = (data.content || []).find((b) => b.type === 'text')
    let analysis = null
    try { analysis = JSON.parse(textBlock ? textBlock.text : '{}') } catch (_) {}
    if (!analysis) return json(502, { error: 'The AI returned an unreadable response.' })
    return json(200, { analysis })
  } catch (e) {
    return json(502, { error: 'Could not reach the AI service.', detail: String(e).slice(0, 200) })
  }
}
