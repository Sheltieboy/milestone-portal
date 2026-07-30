// SCERTS — AI planning assistant (serverless).
// The teacher selects the TARGET and the TRANSACTIONAL SUPPORTS from the
// organisation's LICENSED SCERTS library; this function only explains, plans
// and exemplifies. It must never invent targets or supports.
//
// Two modes:
//   suggest_supports — choose relevant supports FROM the supplied licensed list
//   plan             — why-this-target, how to use each support, activities,
//                      success criteria
//
// The API key lives only in this function's env; the caller's Supabase session
// is verified so it can't be used anonymously.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const SUPABASE_URL = 'https://kjbhnsikjymobudmlgmy.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqYmhuc2lranltb2J1ZG1sZ215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjY4NDgsImV4cCI6MjA5NDM0Mjg0OH0.65RefY6qK1ohQqRpjuFi75CNBip8P_Qy2owyKJKtWmI'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (statusCode, obj) => ({ statusCode, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(obj) })

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    why: { type: 'string' },
    supports: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { support: { type: 'string' }, purpose: { type: 'string' }, example: { type: 'string' } },
      required: ['support', 'purpose', 'example'] } },
    activities: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: { name: { type: 'string' }, resources: { type: 'string' }, adult_role: { type: 'string' }, learner_response: { type: 'string' }, increase_challenge: { type: 'string' } },
      required: ['name', 'resources', 'adult_role', 'learner_response', 'increase_challenge'] } },
    success_criteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['why', 'supports', 'activities', 'success_criteria'],
}

const SUGGEST_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { codes: { type: 'array', items: { type: 'string' } } },
  required: ['codes'],
}

const SUMMARY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    trend: { type: 'string' },
    readiness: { type: 'string', enum: ['keep_going', 'ready_for_review', 'ready_to_progress'] },
    rationale: { type: 'string' },
    next_focus: { type: 'string' },
  },
  required: ['summary', 'trend', 'readiness', 'rationale', 'next_focus'],
}

const BASE_RULES = `You assist Additional Support Needs (ASN) teachers in Scotland who are planning SCERTS interventions. Rules you must follow exactly:
- The SCERTS target and the Transactional Supports are supplied to you from the school's LICENSED SCERTS materials. NEVER invent, rename or substitute a target or a support that is not supplied. Work only with what you are given.
- Stay faithful to SCERTS terminology (Social Communication, Emotional Regulation, Transactional Support; Joint Attention, Symbol Use, Mutual Regulation, Self-Regulation, Interpersonal Support, Learning Support).
- Use strengths-based, respectful, inclusive language about the learner.
- Favour naturalistic supports before intrusive prompting; support participation across the whole school day, not only at a desk.
- Write for Scottish settings (mainstream, enhanced provision, special school). British English.
- Support professional judgement — never replace it. Keep it practical and concise for busy teachers.`

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json(503, { error: 'AI is not configured yet (missing ANTHROPIC_API_KEY).' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json(401, { error: 'Please sign in.' })
  try {
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } })
    if (!uRes.ok) return json(401, { error: 'Your session is invalid — sign in again.' })
  } catch (_) {
    return json(401, { error: 'Could not verify your session.' })
  }

  let p
  try { p = JSON.parse(event.body || '{}') } catch (_) { return json(400, { error: 'Bad request.' }) }
  const { mode, target, supports = [], stage, learner, entries = [] } = p
  if (!target || !target.text) return json(400, { error: 'Missing target.' })

  // ── Mode: summarise progress over time + readiness to review ──
  if (mode === 'progress_summary') {
    if (entries.length < 2) return json(400, { error: 'Need at least two observation notes.' })
    const RATING_ORDER = 'not_yet < emerging < developing < consistent < generalised'
    const log = entries.map((e) =>
      `${e.date || '?'} — ${e.rating}${e.context ? ` | context: ${e.context}` : ''}${e.support_used ? ` | support: ${e.support_used}` : ''}${e.response ? ` | response: ${e.response}` : ''}${e.next_steps ? ` | next: ${e.next_steps}` : ''}`
    ).join('\n')
    const sys = `${BASE_RULES}
- You are reviewing a teacher's own observation notes against ONE SCERTS target. Base everything on those notes; do not invent evidence.
- Progress scale (low→high): ${RATING_ORDER}.
- "readiness": "keep_going" if the target still needs work; "ready_for_review" if progress has plateaued or the evidence is mixed and the plan should be revisited; "ready_to_progress" only if the learner is consistently or generally meeting the target across contexts.
- "next_focus" is a short suggestion of what to focus on next — describe it in SCERTS terms, but do NOT name a specific new target code (the teacher selects that from the licensed library).
- Be encouraging and concrete; one or two short sentences per field.`
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5', max_tokens: 900,
          output_config: { format: { type: 'json_schema', schema: SUMMARY_SCHEMA } },
          system: sys,
          messages: [{ role: 'user', content: `Target ${target.code || ''}: ${target.text}\n\nObservation notes (oldest first):\n${log}\n\nSummarise progress and judge readiness.` }],
        }),
      })
      if (!r.ok) return json(502, { error: 'The AI request failed.' })
      const d = await r.json()
      if (d.stop_reason === 'refusal') return json(200, { error: 'The AI declined this request.' })
      const tb = (d.content || []).find((b) => b.type === 'text')
      let summary = null
      try { summary = JSON.parse(tb ? tb.text : '{}') } catch (_) {}
      if (!summary || !summary.summary) return json(502, { error: 'The AI returned an unreadable response.' })
      return json(200, { summary })
    } catch (e) {
      return json(502, { error: 'Could not reach the AI service.' })
    }
  }

  // ── Mode: suggest supports from the licensed list ──
  if (mode === 'suggest_supports') {
    if (!supports.length) return json(400, { error: 'No supports supplied.' })
    const list = supports.map((s) => `${s.code}: ${s.text}`).join('\n')
    const body = {
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      output_config: { format: { type: 'json_schema', schema: SUGGEST_SCHEMA } },
      system: `${BASE_RULES}\n- For this task you return ONLY codes copied exactly from the supplied list. Choose the 4–6 Transactional Supports most likely to help this target. Never return a code that is not in the list.`,
      messages: [{ role: 'user', content: `SCERTS target ${target.code}: ${target.text}\n\nLicensed Transactional Supports to choose from:\n${list}\n\nReturn the codes of the 4–6 most relevant supports for this target.` }],
    }
    try {
      const r = await fetch(ANTHROPIC_URL, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) return json(502, { error: 'The AI request failed.' })
      const d = await r.json()
      if (d.stop_reason === 'refusal') return json(200, { error: 'The AI declined this request.' })
      const tb = (d.content || []).find((b) => b.type === 'text')
      let out = null
      try { out = JSON.parse(tb ? tb.text : '{}') } catch (_) {}
      if (!out || !Array.isArray(out.codes)) return json(502, { error: 'The AI returned an unreadable response.' })
      // hard filter: only codes that were actually offered
      const allowed = new Set(supports.map((s) => s.code))
      return json(200, { codes: out.codes.filter((c) => allowed.has(c)) })
    } catch (e) {
      return json(502, { error: 'Could not reach the AI service.' })
    }
  }

  // ── Mode: full plan ──
  const supportList = supports.length
    ? supports.map((s) => `${s.code}: ${s.text}`).join('\n')
    : '(none selected)'
  const system = `${BASE_RULES}
- "why" is 2–3 sentences on how this target supports communication or emotional regulation within SCERTS.
- "supports": one entry for EACH supplied Transactional Support, in the order given — copy its wording into "support", then give a short purpose and a concrete classroom example. Do not add supports that were not supplied.
- "activities": 3–5 practical classroom activities aligned to the target.
- "success_criteria": 3–4 measurable criteria (e.g. "Shares attention in 4 out of 5 opportunities").
- Keep every field to one or two short sentences.`

  const userMsg = `SCERTS stage: ${stage || '(not given)'}
Learner: ${learner || 'the learner'}
Target ${target.code || ''}: ${target.text}

Transactional Supports the teacher selected (from the licensed materials):
${supportList}

Produce the planning guidance.`

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 3000,
        output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      return json(502, { error: 'The AI request failed.', detail: t.slice(0, 200) })
    }
    const d = await r.json()
    if (d.stop_reason === 'refusal') return json(200, { error: 'The AI declined to plan this content.' })
    if (d.stop_reason === 'max_tokens') return json(200, { error: 'The guidance was too long to finish — please try again.' })
    const tb = (d.content || []).find((b) => b.type === 'text')
    let plan = null
    try { plan = JSON.parse(tb ? tb.text : '{}') } catch (_) {}
    if (!plan) return json(502, { error: 'The AI returned an unreadable response.', detail: `stop=${d.stop_reason}` })
    return json(200, { plan })
  } catch (e) {
    return json(502, { error: 'Could not reach the AI service.', detail: String(e).slice(0, 150) })
  }
}
