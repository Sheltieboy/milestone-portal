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
    // Strategies MUST be drawn verbatim/near-verbatim from the licensed text supplied at runtime, each with its citation.
    strategies: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { area: { type: 'string' }, recommendation: { type: 'string' }, relevance: { type: 'string' }, source_ref: { type: 'string' } }, required: ['area', 'recommendation', 'relevance', 'source_ref'] } },
  },
  required: ['summary', 'strengths', 'development', 'patterns', 'priorities', 'strategies'],
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

  // Map each CICS item to the CIRCLE skill area(s) whose strategies are relevant,
  // so we retrieve only the areas this assessment actually needs (keeps the AI
  // call fast enough for Netlify's ~10s limit and sharpens the retrieval).
  const AREA_MAP = {
    'Accessibility of Space': ['gross_motor'], 'Adequacy of Space': ['gross_motor'],
    'Sensory Space': ['attention'], 'Visual supports': ['communication'], 'Availability of Objects': ['fine_motor'],
    'Attitudes': ['social_emotional'], 'Support and Facilitation': ['communication'], 'Relationships': ['social_emotional'],
    'Provision of Information': ['communication'], 'Empowerment': ['social_emotional'],
    'Activity Demands': ['attention'], 'Expectations': ['organisation'], 'Appeal of Activities': ['attention'],
    'Routines': ['organisation'], 'Decision-making': ['social_emotional'],
  }
  // Prefer the flagged development items; if none, fall back to the 3 lowest-rated items.
  const allItems = sections.flatMap((s) => (s.items || []).map((i) => ({ name: i.name, rating: i.rating })))
  let focus = (developItems && developItems.length ? developItems : allItems.slice().sort((a, b) => (a.rating || 4) - (b.rating || 4)).slice(0, 3))
  const areaSet = new Set()
  focus.forEach((f) => (AREA_MAP[f.name] || []).forEach((a) => areaSet.add(a)))
  const areas = Array.from(areaSet).slice(0, 4)

  // Retrieve only the relevant LICENSED strategy areas (RLS gates to licensed orgs via the caller's token).
  let strategies = []
  if (areas.length) {
    try {
      const inList = areas.map((a) => `"${a}"`).join(',')
      const sRes = await fetch(`${SUPABASE_URL}/rest/v1/circle_strategies?select=title,body,source_ref,area_code&area_code=in.(${inList})&order=sort_order`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
      })
      if (sRes.ok) strategies = await sRes.json()
    } catch (_) {}
  }

  const hasLicensed = strategies.length > 0
  const licensedBlock = hasLicensed
    ? strategies.map((s) => `### ${s.title}  [cite as: ${s.source_ref}]\n${s.body}`).join('\n\n')
    : ''

  const system = `You support a Scottish ASN (Additional Support Needs) practitioner interpreting a completed ${instrument || 'CIRCLE'} assessment. Follow these rules exactly:
- Base every statement ONLY on the numeric ratings provided. Never invent items, scores, or questionnaire content.
- The ratings are the LICENSED assessment result. Everything you write is AI interpretation of those ratings — never present it as part of the licensed scoring.
- Rating scale: 4 = environment strongly supports participation (exceptional), 3 = supports participation (effective), 2 = interferes (limited support), 1 = strongly interferes. Items rated 2 or below are development areas.
${hasLicensed
  ? `- STRATEGIES: You are given the organisation's LICENSED CIRCLE strategies below. Populate "strategies" ONLY with strategies that appear in that licensed text — quote or very closely paraphrase the licensed wording, choose ones relevant to the development areas, and set "source_ref" to the EXACT citation given for that strategy's area. Never invent, rename, or substitute a strategy that is not in the licensed text. If no licensed strategy fits a development area, omit it rather than inventing one.`
  : `- STRATEGIES: No licensed strategy text was available, so return an empty "strategies" array. Do NOT invent CIRCLE strategies.`}
- Be concise, practical, encouraging, and specific to the ratings. British English.`

  const userMsg = `Assessment: ${instrument || 'CICS'} for "${subject || 'a classroom'}".
Overall mean rating: ${overallMean} out of 4.
Section means and item ratings:
${sections.map((s) => `- ${s.name} (mean ${s.mean}): ${(s.items || []).map((i) => `${i.name}=${i.rating}`).join(', ')}`).join('\n')}
Development areas (rated 2 or below): ${developItems && developItems.length ? developItems.map((d) => `${d.name} (${d.rating})`).join(', ') : 'none'}.
${hasLicensed ? `\nLICENSED CIRCLE STRATEGIES (the ONLY strategies you may recommend — cite each with its stated source_ref):\n\n${licensedBlock}\n` : ''}
Give a grounded interpretation: an overall summary, key strengths, areas for development, cross-domain patterns, prioritised SMART action plans (each with why it matters, a SMART goal, a review timeframe in weeks, and evidence that would show improvement), and a "strategies" list drawn from the licensed strategies above (each with the area, the recommended strategy, why it is relevant to this assessment, and its source_ref citation).`

  try {
    const aRes = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        // Haiku 4.5: fast + capable enough for this bounded interpretation, and
        // returns well within Netlify's ~10s synchronous function limit (Opus 5
        // thinks by default and times out here). No `effort` — it errors on Haiku.
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
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
