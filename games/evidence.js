// ── Games evidence loop ──────────────────────────────────────────────────
// Opt-in per game. On load it ALWAYS shows a start popup asking the teacher to
// play with one pupil, a group, or just play (and log afterwards). Choosing a
// pupil/group then lets them pick the statement and play; the "Snap evidence"
// button writes a real evidence card (evidence_records + evidence_targets) for
// each assigned pupil — which shows on their timeline + term report.
// Notes-only evidence is not consent-gated, so it saves with no friction.
// If nobody is signed in, the popup still appears (logging options disabled,
// "Just play" available) and the game's own snap behaviour stays in place.

window.MEvidence = (function () {
  var URL = 'https://kjbhnsikjymobudmlgmy.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqYmhuc2lranltb2J1ZG1sZ215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjY4NDgsImV4cCI6MjA5NDM0Mjg0OH0.65RefY6qK1ohQqRpjuFi75CNBip8P_Qy2owyKJKtWmI';

  var session = null, opts = null;
  var pupils = [], milestones = [], supports = [], engagements = [];
  var assigned = [], chosenMid = null, chosenStatement = '', startedAt = 0;
  var activated = false, dataReady = false, selectMode = 'group', assignAfter = 'start';

  function H() { return { apikey: ANON, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }; }
  function getJSON(path) { return fetch(URL + '/rest/v1/' + path, { headers: H() }).then(function (r) { return r.json(); }); }
  function post(path, body, prefer) {
    var h = H(); if (prefer) h['Prefer'] = prefer;
    return fetch(URL + '/rest/v1/' + path, { method: 'POST', headers: h, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) { if (!r.ok) throw new Error(t || ('HTTP ' + r.status)); try { return JSON.parse(t); } catch (e) { return null; } }); });
  }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function injectStyles() {
    if (document.getElementById('me-styles')) return;
    var s = document.createElement('style'); s.id = 'me-styles';
    s.textContent = '.me-ov{position:fixed;inset:0;background:rgba(11,58,35,.55);display:none;align-items:center;justify-content:center;padding:18px;z-index:60}.me-ov.open{display:flex}.me-panel{background:#fff;color:#1a1a1a;border-radius:20px;max-width:480px;width:100%;max-height:90vh;overflow:auto;padding:22px;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}.me-panel h3{font-size:20px;font-weight:800;color:#1a5c3a;margin:0 0 4px}.me-panel .sub{font-size:13px;color:#5f7a6c;margin:0 0 8px}.me-lab{font-size:12px;font-weight:800;color:#2d8a5e;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px}.me-chips{display:flex;flex-wrap:wrap;gap:8px}.me-chip{border:1.5px solid #e0f0e8;border-radius:22px;padding:8px 14px;font-size:14px;cursor:pointer;background:#fff;font-family:inherit;color:#1a1a1a}.me-chip.sel{border-color:#2d8a5e;background:#e8f5ee;color:#1a5c3a;font-weight:700}.me-list{display:flex;flex-direction:column;gap:6px;max-height:210px;overflow:auto;margin-top:4px}.me-mile{border:1.5px solid #e0f0e8;border-radius:12px;padding:10px 12px;font-size:13.5px;cursor:pointer;color:#1a1a1a;line-height:1.4}.me-mile.sel{border-color:#2d8a5e;background:#e8f5ee}.me-mile .strand{font-size:11px;color:#5f7a6c;display:block;margin-bottom:2px}.me-note{width:100%;min-height:66px;border:1px solid #e0f0e8;border-radius:12px;padding:10px;font-size:14px;font-family:inherit;color:#1a1a1a;resize:vertical}.me-sel{width:100%;border:1px solid #e0f0e8;border-radius:12px;padding:11px;font-size:14px;font-family:inherit;margin-top:4px}.me-row{display:flex;gap:10px;margin-top:18px}.me-btn{flex:1;text-align:center;background:#2d8a5e;color:#fff;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}.me-btn[disabled]{opacity:.5;cursor:default}.me-ghost{background:#fff;border:1px solid #e0f0e8;border-radius:12px;padding:13px 16px;font-size:14px;cursor:pointer;font-family:inherit;color:#5f7a6c}.me-ok{text-align:center;padding:14px 0}.me-ok .big{font-size:38px}.me-summary{font-size:13px;color:#3a5244;background:#f6faf7;border:1px dashed #e0f0e8;border-radius:10px;padding:9px 12px;margin-bottom:4px}.me-opt{display:block;width:100%;text-align:left;border:1.5px solid #e0f0e8;border-radius:14px;padding:13px 16px;font-size:15px;font-weight:800;color:#1a5c3a;background:#fff;cursor:pointer;font-family:inherit;margin-bottom:10px}.me-opt:hover{border-color:#2d8a5e;background:#f6faf7}.me-opt .d{display:block;font-size:12.5px;font-weight:500;color:#5f7a6c;margin-top:2px}.me-opt[disabled]{opacity:.45;cursor:default;background:#fafafa}.me-opt.ghost{color:#2d8a5e}.me-hint{font-size:12.5px;color:#92670f;background:#fff7e8;border:1px solid #f0e2c8;border-radius:10px;padding:9px 12px;margin-top:6px;display:none}.me-hint.show{display:block}';
    document.head.appendChild(s);
  }

  var startOv, assignOv, saveOv, noteEl, engSel, supChipsEl, startBtn;

  function buildOverlays() {
    if (document.getElementById('me-start-ov')) {
      startOv = document.getElementById('me-start-ov');
      assignOv = document.getElementById('me-assign'); saveOv = document.getElementById('me-save');
      startBtn = assignOv.querySelector('#me-start'); return;
    }

    startOv = el('div', 'me-ov'); startOv.id = 'me-start-ov';
    startOv.innerHTML =
      '<div class="me-panel">' +
      '<h3 id="me-start-title">Ready to play</h3>' +
      '<div class="sub">How would you like to record this game?</div>' +
      '<button class="me-opt" data-mode="single">🧑 One pupil<span class="d">Log this game to one pupil\'s record</span></button>' +
      '<button class="me-opt" data-mode="group">👥 A group<span class="d">Log to several pupils at once</span></button>' +
      '<button class="me-opt ghost" data-mode="play">▶️ Just play<span class="d">Explore now — you can log evidence after</span></button>' +
      '<div class="me-hint" id="me-start-hint"></div></div>';
    document.body.appendChild(startOv);
    [].forEach.call(startOv.querySelectorAll('.me-opt'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-mode');
        if (m === 'play') { justPlay(); }
        else { chooseMode(m); }
      });
    });

    assignOv = el('div', 'me-ov'); assignOv.id = 'me-assign';
    assignOv.innerHTML =
      '<div class="me-panel">' +
      '<h3 id="me-assign-title">Who is playing?</h3><div class="sub" id="me-assign-sub">Tap the pupils, choose the statement, then play.</div>' +
      '<div class="me-lab" id="me-pupils-lab">Pupils</div><div class="me-chips" id="me-pupils"></div>' +
      '<div class="me-lab">Statement being evidenced</div><div class="me-list" id="me-miles"></div>' +
      '<div class="me-row"><button class="me-btn" id="me-start" disabled>Start playing ▸</button>' +
      '<button class="me-ghost" id="me-back">Back</button></div></div>';
    document.body.appendChild(assignOv);
    startBtn = assignOv.querySelector('#me-start');
    startBtn.addEventListener('click', function () {
      if (!assigned.length) return;
      assignOv.classList.remove('open');
      if (assignAfter === 'start') { startedAt = nowMs(); }
      else { showSave(); }
    });
    assignOv.querySelector('#me-back').addEventListener('click', function () { assignOv.classList.remove('open'); showStart(); });

    saveOv = el('div', 'me-ov'); saveOv.id = 'me-save';
    document.body.appendChild(saveOv);
  }

  var _start = (window.performance && performance.now) ? function () { return performance.timeOrigin + performance.now(); } : function () { return new Date(0).getTime(); };
  function nowMs() { try { return Date.now(); } catch (e) { return _start(); } }

  // ── Start popup ──
  function showStart() {
    var title = startOv.querySelector('#me-start-title');
    if (title) title.textContent = opts.title || 'Ready to play';
    var hint = startOv.querySelector('#me-start-hint');
    var canLog = !!session && dataReady && pupils.length > 0;
    [].forEach.call(startOv.querySelectorAll('.me-opt[data-mode="single"], .me-opt[data-mode="group"]'), function (b) { b.disabled = !canLog; });
    if (!session) { hint.textContent = 'Open a game from the portal while signed in to log evidence to pupils. You can still play here.'; hint.classList.add('show'); }
    else if (!dataReady) { hint.textContent = 'Loading your pupils…'; hint.classList.add('show'); }
    else if (!pupils.length) { hint.textContent = 'No pupils found on your account yet.'; hint.classList.add('show'); }
    else { hint.classList.remove('show'); }
    startOv.classList.add('open');
  }

  function chooseMode(m) {
    if (!session || !pupils.length) return;
    selectMode = m; assigned = [];
    startOv.classList.remove('open');
    openAssign('start');
  }
  function justPlay() { assigned = []; startedAt = nowMs(); startOv.classList.remove('open'); }

  // ── Assign panel ──
  function openAssign(after) {
    assignAfter = after;
    assignOv.querySelector('#me-assign-title').textContent = after === 'start' ? 'Who is playing?' : 'Who was this for?';
    assignOv.querySelector('#me-assign-sub').textContent = after === 'start'
      ? 'Tap the pupil(s), choose the statement, then play. You can save when you finish.'
      : 'Tap the pupil(s) this game was for, then choose the statement to save against.';
    assignOv.querySelector('#me-pupils-lab').textContent = selectMode === 'single' ? 'Pupil' : 'Pupils';
    startBtn.textContent = after === 'start' ? 'Start playing ▸' : 'Continue to save ▸';
    renderPupils(); renderMiles();
    startBtn.disabled = assigned.length === 0;
    assignOv.classList.add('open');
  }

  function renderPupils() {
    var box = assignOv.querySelector('#me-pupils'); box.innerHTML = '';
    pupils.forEach(function (p) {
      var c = el('div', 'me-chip' + (assigned.indexOf(p.id) >= 0 ? ' sel' : ''), esc(p.full_name));
      c.addEventListener('click', function () {
        if (selectMode === 'single') {
          assigned = (assigned.length === 1 && assigned[0] === p.id) ? [] : [p.id];
          [].forEach.call(box.children, function (x) { x.classList.remove('sel'); });
          if (assigned.length) c.classList.add('sel');
        } else {
          var i = assigned.indexOf(p.id);
          if (i >= 0) assigned.splice(i, 1); else assigned.push(p.id);
          c.classList.toggle('sel');
        }
        startBtn.disabled = assigned.length === 0;
      });
      box.appendChild(c);
    });
  }
  function renderMiles() {
    var box = assignOv.querySelector('#me-miles'); box.innerHTML = '';
    if (!milestones.length) { box.innerHTML = '<div class="me-summary">No matching statements found — evidence will still save against the game area.</div>'; chosenMid = null; chosenStatement = opts.title || ''; return; }
    milestones.forEach(function (m, idx) {
      var row = el('div', 'me-mile' + (idx === 0 ? ' sel' : ''),
        (m.strand ? '<span class="strand">' + esc(m.strand) + '</span>' : '') + esc(m.statement));
      row.addEventListener('click', function () {
        [].forEach.call(box.children, function (x) { x.classList.remove('sel'); });
        row.classList.add('sel'); chosenMid = m.id; chosenStatement = m.statement;
      });
      box.appendChild(row);
    });
    chosenMid = milestones[0].id; chosenStatement = milestones[0].statement;
  }

  // When a game doesn't supply getNotes(), build a summary from the visible
  // tally (#count) plus a per-game unit word, e.g. "Pop! · 8 pops".
  function defaultNote() {
    var t = opts.title || 'Game';
    var c = document.getElementById('count');
    var n = c ? parseInt((c.textContent || '').replace(/[^0-9]/g, ''), 10) : NaN;
    if (!isNaN(n)) return t + ' · ' + n + ' ' + (opts.noteUnit || 'rounds');
    return 'Played ' + t;
  }

  function showSave() {
    var names = pupils.filter(function (p) { return assigned.indexOf(p.id) >= 0; }).map(function (p) { return p.full_name; });
    var mins = Math.max(1, Math.round((nowMs() - startedAt) / 60000));
    var auto = (opts.getNotes ? opts.getNotes() : defaultNote()) + ' · about ' + mins + ' min';
    saveOv.innerHTML =
      '<div class="me-panel">' +
      '<h3>Save evidence</h3>' +
      '<div class="me-summary">For: <b>' + esc(names.join(', ')) + '</b></div>' +
      '<div class="me-summary">Statement: ' + esc(chosenStatement || opts.title) + '</div>' +
      '<div class="me-lab">What happened</div><textarea class="me-note" id="me-note">' + esc(auto) + '</textarea>' +
      '<div class="me-lab">Support given</div><div class="me-chips" id="me-sup"></div>' +
      '<div class="me-lab">Engagement</div><select class="me-sel" id="me-eng"><option value="">—</option></select>' +
      '<div class="me-row"><button class="me-btn" id="me-save-btn">Save to ' + names.length + ' record' + (names.length === 1 ? '' : 's') + ' ▸</button>' +
      '<button class="me-ghost" id="me-cancel">Cancel</button></div></div>';
    noteEl = saveOv.querySelector('#me-note');
    supChipsEl = saveOv.querySelector('#me-sup');
    var supSel = [];
    supports.forEach(function (s) {
      var c = el('div', 'me-chip', (s.icon ? s.icon + ' ' : '') + esc(s.label));
      c.addEventListener('click', function () { var i = supSel.indexOf(s.code); if (i >= 0) supSel.splice(i, 1); else supSel.push(s.code); c.classList.toggle('sel'); });
      supChipsEl.appendChild(c);
    });
    engSel = saveOv.querySelector('#me-eng');
    engagements.forEach(function (e) { var o = el('option'); o.value = e.code; o.textContent = e.label; engSel.appendChild(o); });
    saveOv.querySelector('#me-cancel').addEventListener('click', function () { saveOv.classList.remove('open'); });
    saveOv.querySelector('#me-save-btn').addEventListener('click', function () { doSave(supSel); });
    saveOv.classList.add('open');
  }

  function doSave(supCodes) {
    var btn = saveOv.querySelector('#me-save-btn'); btn.disabled = true; btn.textContent = 'Saving…';
    var notes = noteEl.value, eng = engSel.value || null;
    var chain = Promise.resolve();
    assigned.forEach(function (pid) {
      chain = chain.then(function () {
        return post('evidence_records', { pupil_id: pid, created_by: session.user.id, notes: notes }, 'return=representation')
          .then(function (recs) {
            var rec = Array.isArray(recs) ? recs[0] : recs;
            if (rec && rec.id && chosenMid) {
              return post('evidence_targets', { evidence_record_id: rec.id, milestone_id: chosenMid, support_type: supCodes[0] || null, support_types: supCodes, engagement_level: eng });
            }
          });
      });
    });
    chain.then(function () {
      saveOv.innerHTML = '<div class="me-panel"><div class="me-ok"><div class="big">🎉</div><h3>Saved</h3><div class="sub">Evidence added to ' + assigned.length + ' pupil record' + (assigned.length === 1 ? '' : 's') + '. It will appear on their timeline and term report.</div><button class="me-btn" id="me-done">Done</button></div></div>';
      saveOv.querySelector('#me-done').addEventListener('click', function () { saveOv.classList.remove('open'); assigned = []; startedAt = nowMs(); });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Save';
      alert('Could not save evidence: ' + (e.message || e));
    });
  }

  function fetchMilestones() {
    var ev = opts.evidence || {};
    var fw = ev.framework || 'milestones';
    var filters = [];
    if (ev.statementMatch) filters.push('statement.ilike.*' + ev.statementMatch + '*');
    if (ev.strandMatch) filters.push('strand.ilike.*' + ev.strandMatch + '*');
    var path = 'framework_milestones?framework=eq.' + fw + '&select=id,statement,strand,section&order=sort_order&limit=15';
    if (filters.length) path += '&or=(' + filters.join(',') + ')';
    return getJSON(path).then(function (rows) {
      if (Array.isArray(rows) && rows.length) return rows;
      return getJSON('framework_milestones?framework=eq.' + fw + '&select=id,statement,strand,section&order=sort_order&limit=15');
    }).catch(function () { return []; });
  }

  function init(o) {
    opts = o || {};
    startedAt = nowMs();
    try { session = JSON.parse(localStorage.getItem('milestone-session') || 'null'); } catch (e) {}
    if (session && (!session.access_token || (session.expires_at && session.expires_at < nowMs() / 1000))) session = null;
    injectStyles(); buildOverlays();
    showStart(); // always — even when not signed in

    if (!session) return; // logging disabled; "Just play" still works, game keeps its own snap

    Promise.all([
      getJSON('pupils?select=id,full_name&order=full_name'),
      getJSON('support_types?select=code,label,icon&order=sort_order'),
      getJSON('engagement_levels?select=code,label&order=sort_order'),
      fetchMilestones(),
    ]).then(function (res) {
      pupils = Array.isArray(res[0]) ? res[0] : [];
      supports = Array.isArray(res[1]) ? res[1] : [];
      engagements = Array.isArray(res[2]) ? res[2] : [];
      milestones = Array.isArray(res[3]) ? res[3] : [];
      dataReady = true;
      if (!pupils.length) { if (startOv.classList.contains('open')) showStart(); return; }
      activated = true;
      if (startOv.classList.contains('open')) showStart(); // refresh to enable options
      var snap = document.querySelector('.snap');
      if (snap) snap.onclick = function () {
        if (assigned.length) showSave();
        else { selectMode = 'group'; openAssign('save'); }
      };
    }).catch(function (e) { console.warn('[evidence] init', e); });
  }

  // Whether the loop has engaged (teacher signed in + pupils loaded). Games that
  // bind their own snap handler via addEventListener use this to defer to us.
  function active() { return activated; }

  // First names of the currently-assigned pupils, so a game can personalise
  // its on-screen/spoken praise (e.g. "Well done, Ava!"). Empty until assigned.
  function names() {
    return pupils.filter(function (p) { return assigned.indexOf(p.id) >= 0; })
      .map(function (p) { return (p.full_name || '').trim().split(/\s+/)[0]; })
      .filter(Boolean);
  }

  return { init: init, active: active, names: names };
})();
