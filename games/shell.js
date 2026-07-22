window.MGame = (function () {
  var calm = false, sound = true, audioCtx = null, calmCbs = [];
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ── shared config (set via the Set-up panel) + reinforcer state ──
  var gameOpts = {}, cfg = { name: '', reward: 'big' };
  var reinforcerOn = true, sinceWin = 0, MEGA_EVERY = 3;

  // ── Voice (man / woman), persisted across games ──
  var voicePref = 'female', voices = [];
  try { voicePref = localStorage.getItem('milestone.games.voice') || 'female'; } catch (e) {}
  function loadVoices() { try { voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : []; } catch (e) { voices = []; } }
  loadVoices();
  if (window.speechSynthesis && typeof speechSynthesis.addEventListener === 'function') { speechSynthesis.addEventListener('voiceschanged', loadVoices); }
  function pickVoice() {
    if (!voices.length) loadVoices();
    if (!voices.length) return null;
    var femaleKW = /female|woman|kate|serena|stephanie|fiona|moira|tessa|samantha|victoria|karen|amelie|libby|hazel|susan|zira|aria|sonia|martha|google uk english female/i;
    var maleKW = /male|\bman\b|daniel|\balex\b|fred|oliver|george|ryan|\bguy\b|david|james|arthur|google uk english male/i;
    var kw = voicePref === 'male' ? maleKW : femaleKW;
    var gb = voices.filter(function (v) { return /en[-_]?gb/i.test(v.lang); });
    var en = voices.filter(function (v) { return /^en/i.test(v.lang) || /english/i.test(v.name); });
    return (gb.filter(function (v) { return kw.test(v.name); })[0]) || (en.filter(function (v) { return kw.test(v.name); })[0]) || gb[0] || en[0] || voices[0] || null;
  }
  // ── Teacher's own recorded voice (clips in IndexedDB, keyed by normalised word) ──
  var recordedKeys = new Set(), clipCache = {}, curAudio = null;
  function vnorm(t) { return (t || '').toString().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function vdb() { return new Promise(function (res, rej) { try { var r = indexedDB.open('milestone-voices', 1); r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('clips')) r.result.createObjectStore('clips'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); } }); }
  function vkeys() { return vdb().then(function (db) { return new Promise(function (res) { var rq = db.transaction('clips', 'readonly').objectStore('clips').getAllKeys(); rq.onsuccess = function () { res(rq.result || []); }; rq.onerror = function () { res([]); }; }); }).catch(function () { return []; }); }
  function vget(key) { if (clipCache[key]) return Promise.resolve(clipCache[key]); return vdb().then(function (db) { return new Promise(function (res) { var rq = db.transaction('clips', 'readonly').objectStore('clips').get(key); rq.onsuccess = function () { res(rq.result || null); }; rq.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  try { vkeys().then(function (ks) { recordedKeys = new Set(ks); }); } catch (e) {}
  function stopAudio() { if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; } }
  function playClips(keys) {
    stopAudio(); var i = 0;
    (function next() {
      if (i >= keys.length) return;
      vget(keys[i]).then(function (blob) {
        if (!blob) { i++; next(); return; }
        clipCache[keys[i]] = blob;
        var a = new Audio(URL.createObjectURL(blob)); curAudio = a;
        a.onended = function () { i++; next(); };
        a.onerror = function () { i++; next(); };
        a.play().catch(function () { i++; next(); });
      });
    })();
  }
  function speak(text) {
    if (!sound) return;
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    stopAudio();
    var key = vnorm(text);
    // Play the teacher's recording only when the WHOLE cue was recorded (no word-stitching —
    // concatenating separately-recorded words sounds garbled). Otherwise use the computer voice.
    // A game's Set-up can force the computer voice via cfg.voiceMode === 'computer'.
    if (cfg.voiceMode !== 'computer' && recordedKeys.size && recordedKeys.has(key)) { playClips([key]); return; }
    try {
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.9; u.pitch = voicePref === 'male' ? 0.95 : 1.08; u.lang = 'en-GB';
        var v = pickVoice(); if (v) u.voice = v;
        window.speechSynthesis.speak(u);
      }
    } catch (e) {}
  }
  // Stop any in-flight speech when leaving a game so it can't carry over to the menu.
  if (window.speechSynthesis) {
    window.addEventListener('pagehide', function () { try { speechSynthesis.cancel(); } catch (e) {} });
    window.addEventListener('beforeunload', function () { try { speechSynthesis.cancel(); } catch (e) {} });
  }

  // ── praise: labelled (skill-specific) + warm general, personalised with the pupil's name ──
  var PRAISE_BANKS = {
    choosing: ['Good choosing', 'Lovely choosing', 'You chose it'],
    looking: ['Good looking', 'Good finding', 'Good matching'],
    listening: ['Good listening', 'Good sounds', 'Lovely listening'],
    counting: ['Good counting', 'Great counting'],
    talking: ['Good talking', 'Good answering', 'You told me'],
    waiting: ['Good waiting', 'Good turn-taking', 'Nice sharing'],
    cause: ['You did it', 'Look at that'],
    general: ['Brilliant', 'Amazing', 'Wow', 'Fantastic', 'Superstar', 'Hooray', 'Well done', 'Yes']
  };
  function getName() {
    if (cfg.name) return cfg.name;
    try { if (window.MEvidence && MEvidence.names) { var n = MEvidence.names(); if (n && n.length) return n[0]; } } catch (e) {}
    return '';
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function praisePhrase(key) {
    var bank = (PRAISE_BANKS[key] || []).concat(PRAISE_BANKS.general);
    return pick(bank);
  }
  function praiseLine(key) { var nm = getName(); var p = praisePhrase(key); return nm ? (p + ', ' + nm + '!') : (p + '!'); }

  // ── audio flourishes ──
  function toneAt(freq, dur, type, vol) {
    if (!sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
      var t = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(); o.stop(t + dur);
    } catch (e) {}
  }
  function cheer(mega) {
    if (!sound) return;
    var notes = mega ? [392, 523, 659, 784, 1047, 1319] : [392, 523, 659, 784];
    notes.forEach(function (n, i) { setTimeout(function () { toneAt(n, 0.18, 'triangle', 0.22); }, i * 85); });
  }

  // ── particles / flash / shake / fireworks ──
  function particles(stage, x, y, n, big) {
    var colours = ['#ffb020', '#ef6f8e', '#5dcaa5', '#7ec8f0', '#caa25a', '#b06fe0'];
    x = (x == null) ? stage.clientWidth / 2 : x;
    y = (y == null) ? stage.clientHeight * 0.5 : y;
    for (var i = 0; i < n; i++) {
      (function () {
        var d = el('span'); var c = colours[Math.floor(Math.random() * colours.length)];
        var sz = (big ? 10 : 7) + Math.random() * (big ? 12 : 7);
        d.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + sz + 'px;height:' + sz + 'px;border-radius:' + (Math.random() < 0.5 ? '50%' : '3px') + ';background:' + c + ';transform:translate(-50%,-50%);transition:transform 1.1s ease-out, opacity 1.1s;pointer-events:none;z-index:7';
        stage.appendChild(d);
        var ang = Math.random() * Math.PI * 2, dist = (big ? 120 : 70) + Math.random() * (big ? 150 : 120);
        var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 60;
        requestAnimationFrame(function () { d.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))'; d.style.opacity = '0'; });
        setTimeout(function () { d.remove(); }, 1150);
      })();
    }
  }
  function doFlash(op) {
    var f = document.getElementById('ms-flash'); if (!f || !op) return;
    f.style.transition = 'none'; f.style.opacity = op;
    requestAnimationFrame(function () { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; });
  }
  function shakeStage() {
    var st = document.getElementById('stage'); if (!st) return;
    st.classList.remove('ms-shake'); void st.offsetWidth; st.classList.add('ms-shake');
  }
  function fireworks(stage, n) {
    for (var i = 0; i < n; i++) {
      (function (idx) {
        setTimeout(function () {
          var x = stage.clientWidth * (0.2 + Math.random() * 0.6), y = stage.clientHeight * (0.15 + Math.random() * 0.4);
          toneAt(700 + Math.random() * 400, 0.2, 'triangle', 0.16); particles(stage, x, y, 16, true);
        }, idx * 210);
      })(i);
    }
  }

  // ── charge-to-MEGA meter ──
  function buildCharge(stage) {
    var c = el('div', 'ms-charge'); c.id = 'ms-charge';
    c.innerHTML = '<span class="lab">MEGA</span>';
    for (var i = 0; i < MEGA_EVERY; i++) c.appendChild(el('span', 'ms-pip'));
    stage.appendChild(c); paintCharge();
  }
  function paintCharge() {
    var c = document.getElementById('ms-charge'); if (!c) return;
    var pips = c.querySelectorAll('.ms-pip'), on = sinceWin % MEGA_EVERY;
    [].forEach.call(pips, function (p, i) { p.classList.toggle('on', i < on); });
  }

  function showCue(text, big, mega) {
    var c = document.getElementById('cue'); if (!c) return;
    c.textContent = text; c.classList.add('show'); c.classList.toggle('win', !!big); c.classList.toggle('mega', !!mega);
    clearTimeout(c._t); c._t = setTimeout(function () { c.classList.remove('show'); }, 1500);
  }

  // ── THE reinforcer: call at every "correct/success" moment ──
  // opts: { el | x,y } position · say (word to announce) · cue (override banner) ·
  //       praiseKey · quiet (no speech) · noPraise (announce say but skip praise) · light (no flash/shake)
  function win(opts) {
    opts = opts || {};
    var st = document.getElementById('stage'); if (!st) return;
    var x, y;
    if (opts.el && opts.el.getBoundingClientRect) { var r = opts.el.getBoundingClientRect(), s = st.getBoundingClientRect(); x = r.left - s.left + r.width / 2; y = r.top - s.top + r.height / 2; }
    else { x = opts.x; y = opts.y; }
    sinceWin++;
    var mega = reinforcerOn && (sinceWin % MEGA_EVERY === 0);
    var size = calm ? 'calm' : (cfg.reward || 'big');
    var SC = { calm: { p: 8, fw: 0, flash: 0 }, medium: { p: 24, fw: 2, flash: 0.4 }, big: { p: 42, fw: 3, flash: 0.6 } }[size] || { p: 24, fw: 2, flash: 0.4 };
    particles(st, x, y, mega ? SC.p * 2 : SC.p, mega || size === 'big');
    if (!opts.light && size !== 'calm') { doFlash(mega ? Math.min(0.85, SC.flash + 0.2) : SC.flash); shakeStage(); }
    if (mega && size !== 'calm') fireworks(st, SC.fw + 2);
    toneAt(660, 0.36, 'sine', 0.24);
    if (size !== 'calm' && (!opts.quiet || mega)) cheer(mega);
    if (!opts.quiet) {
      var line = opts.noPraise ? null : praiseLine(opts.praiseKey || gameOpts.praise);
      if (opts.say && line) { speak(opts.say); setTimeout(function () { speak(line); }, 600); }
      else if (opts.say) { speak(opts.say); }
      else if (line) { speak(line); }
    }
    if (!opts.light || mega) { // high-frequency callers only show the banner on a MEGA
      var banner = opts.cue || (mega ? (getName() ? 'MEGA, ' + getName() + '!' : 'MEGA!') : (praisePhrase(opts.praiseKey || gameOpts.praise) + '!'));
      showCue(banner, true, mega);
    }
    paintCharge();
  }
  function praiseNow() { // teacher praise-on-demand (no charge advance)
    var st = document.getElementById('stage'); if (!st) return;
    particles(st, st.clientWidth / 2, st.clientHeight * 0.5, calm ? 8 : 22, false);
    if (!calm) cheer(false);
    var line = praiseLine(gameOpts.praise); speak(line); showCue(line, true, false);
  }

  // ── bar ──
  function buildBar(opts) {
    var bar = document.getElementById('bar'); if (!bar) return;
    bar.innerHTML = '<a href="../games.html">← Games</a><span class="title">' + opts.title + '</span>';
    var right = el('div', 'right');
    if (opts.themes && opts.themes.length) {
      var sel = el('select'); sel.setAttribute('aria-label', 'Theme');
      opts.themes.forEach(function (t) { var o = el('option'); o.value = t.value; o.textContent = t.label; sel.appendChild(o); });
      sel.addEventListener('change', function () { if (opts.onTheme) opts.onTheme(sel.value); });
      right.appendChild(sel);
    }
    if (reinforcerOn) {
      var setupBtn = el('button', 'accent', '⚙ Set up');
      setupBtn.addEventListener('click', openSetup); right.appendChild(setupBtn);
      var praiseBtn = el('button', null, '👏 Praise');
      praiseBtn.addEventListener('click', praiseNow); right.appendChild(praiseBtn);
    }
    var calmBtn = el('button', null, 'Low-stim: off');
    calmBtn.addEventListener('click', function () {
      calm = !calm; calmBtn.textContent = 'Low-stim: ' + (calm ? 'on' : 'off'); calmBtn.classList.toggle('on', calm);
      var st = document.getElementById('stage'); if (st) st.classList.toggle('calm', calm);
      calmCbs.forEach(function (c) { c(calm); });
    });
    var soundBtn = el('button', 'on', 'Sound: on');
    soundBtn.addEventListener('click', function () { sound = !sound; soundBtn.textContent = 'Sound: ' + (sound ? 'on' : 'off'); soundBtn.classList.toggle('on', sound); });
    var voiceBtn = el('button', null, 'Voice: ' + (voicePref === 'male' ? 'Man' : 'Woman'));
    voiceBtn.addEventListener('click', function () {
      voicePref = voicePref === 'male' ? 'female' : 'male';
      voiceBtn.textContent = 'Voice: ' + (voicePref === 'male' ? 'Man' : 'Woman');
      try { localStorage.setItem('milestone.games.voice', voicePref); } catch (e) {}
      speak('Hello');
    });
    var fullBtn = el('button', null, 'Fullscreen');
    fullBtn.addEventListener('click', function () {
      var d = document.documentElement;
      if (!document.fullscreenElement) { (d.requestFullscreen || d.webkitRequestFullscreen || function () {}).call(d); }
      else { (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document); }
    });
    right.appendChild(calmBtn); right.appendChild(soundBtn); right.appendChild(voiceBtn); right.appendChild(fullBtn);
    bar.appendChild(right);
  }

  // ── Set-up panel (teacher options) ──
  function openSetup() {
    var ov = document.getElementById('ms-setup'); if (!ov) return;
    var nm = document.getElementById('ms-name'); if (nm && !cfg.name) { var g = getName(); if (g) { nm.value = g; } }
    ov.classList.add('open');
  }
  function buildSetup(opts) {
    var ov = el('div', 'ms-ov'); ov.id = 'ms-setup';
    var rows = '<div class="panel"><h3>Set up the game</h3><div class="sub">Dial it in for the pupil in front of you.</div>'
      + '<div class="lbl">Who\'s playing? (for praise)</div><input class="ms-name" id="ms-name" placeholder="e.g. Ava" autocomplete="off">'
      + '<div class="lbl">Celebration size</div><div class="ms-opts" id="ms-reward"></div>';
    (opts.setup || []).forEach(function (s, i) { rows += '<div class="lbl">' + s.label + '</div><div class="ms-opts" data-setup="' + i + '"></div>'; });
    if (opts.tip) rows += '<div class="ms-tip">' + opts.tip + '</div>';
    rows += '<div class="actions"><button class="primary" id="ms-done">Start playing ▸</button></div></div>';
    ov.innerHTML = rows; document.body.appendChild(ov);

    var nm = ov.querySelector('#ms-name');
    nm.addEventListener('input', function () { cfg.name = nm.value.trim(); });
    function chips(box, list, getVal, onPick) {
      box.innerHTML = '';
      list.forEach(function (it) {
        var b = el('button', 'ms-opt' + (getVal() === it.v ? ' sel' : ''), it.label);
        b.addEventListener('click', function () { onPick(it.v); [].forEach.call(box.children, function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); });
        box.appendChild(b);
      });
    }
    chips(ov.querySelector('#ms-reward'), [{ v: 'calm', label: 'Calm' }, { v: 'medium', label: 'Medium' }, { v: 'big', label: 'Big' }], function () { return cfg.reward; }, function (v) { cfg.reward = v; });
    (opts.setup || []).forEach(function (s, i) {
      cfg[s.key] = (s.default != null ? s.default : (s.options[0] && s.options[0].v));
      var box = ov.querySelector('[data-setup="' + i + '"]');
      if (s.type === 'select') { // compact dropdown — good for long lists (e.g. topics)
        var sel = el('select', 'ms-sel');
        s.options.forEach(function (o) { var op = el('option'); op.value = o.v; op.textContent = o.label; sel.appendChild(op); });
        sel.value = cfg[s.key];
        sel.addEventListener('change', function () { cfg[s.key] = sel.value; if (opts.onConfig) opts.onConfig(cfg); });
        box.appendChild(sel);
      } else {
        chips(box, s.options, function () { return cfg[s.key]; }, function (v) { cfg[s.key] = v; if (opts.onConfig) opts.onConfig(cfg); });
      }
    });
    ov.querySelector('#ms-done').addEventListener('click', function () { ov.classList.remove('open'); if (opts.onConfig) opts.onConfig(cfg); });
  }

  function buildSheet(opts) {
    var sheet = document.getElementById('sheet'); if (!sheet) return;
    var sup = ['Independent', 'Gestural prompt', 'Verbal prompt', 'Modelled', 'Physical support', 'Hand-over-hand'];
    sheet.innerHTML = '<div class="panel"><h3>Snap evidence</h3>' +
      '<div class="sub">Pre-filled from this game. Choose the support level, then save to the pupil(s) in the portal.</div>' +
      '<div class="row"><b>Framework</b><span>' + opts.framework + '</span></div>' +
      '<div class="row"><b>Statement</b><span>' + opts.statement + '</span></div>' +
      '<div class="row"><b>Engagement</b><span>' + opts.engagement + '</span></div>' +
      '<div class="lbl">Support level given</div><div class="supports" id="m-sup"></div>' +
      '<div class="actions"><a class="primary" href="../index.html#capture">Choose pupils &amp; save ▸</a>' +
      '<button class="ghost" id="m-close">Close</button></div></div>';
    var sc = sheet.querySelector('#m-sup');
    sup.forEach(function (s) {
      var b = el('button', 'sup', s);
      b.addEventListener('click', function () { [].forEach.call(sc.children, function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); });
      sc.appendChild(b);
    });
    sheet.querySelector('#m-close').addEventListener('click', function () { sheet.classList.remove('open'); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.classList.remove('open'); });
  }

  return {
    init: function (opts) {
      gameOpts = opts || {};
      if (gameOpts.reinforcer === false) reinforcerOn = false;
      if (gameOpts.megaEvery) MEGA_EVERY = gameOpts.megaEvery;
      buildBar(opts); buildSheet(opts);
      var st = document.getElementById('stage');
      if (st && reinforcerOn) {
        if (!document.getElementById('ms-flash')) { var f = el('div', 'ms-flash'); f.id = 'ms-flash'; st.appendChild(f); }
        if (!document.getElementById('ms-charge')) buildCharge(st);
        buildSetup(opts);
      }
    },
    get calm() { return calm; },
    get sound() { return sound; },
    cfg: function (k) { return cfg[k]; },
    onCalm: function (cb) { calmCbs.push(cb); },
    openEvidence: function () { var s = document.getElementById('sheet'); if (s) s.classList.add('open'); },
    say: function (text) { speak(text); },
    tone: function (freq, dur, type) { toneAt(freq, dur, type); },
    win: win,
    praiseNow: praiseNow,
    burst: function (stage, x, y) { particles(stage, x, y, calm ? 7 : 16, false); },
    cue: function (text, ms) {
      var c = document.getElementById('cue'); if (!c) return;
      c.textContent = text; c.classList.add('show');
      if (ms) setTimeout(function () { c.classList.remove('show'); }, ms);
    },
    hideCue: function () { var c = document.getElementById('cue'); if (c) { c.classList.remove('show', 'win', 'mega'); } }
  };
})();
