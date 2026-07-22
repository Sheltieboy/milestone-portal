// ── Shared topic packs ───────────────────────────────────────────────────
// One library of themed picture sets that every vocabulary game pulls from
// (Find It, Choose It, Same & Different, Big Count, Tap & Discover). Add a
// pack here once and it appears in all of them. Each item is [emoji, word].
// Phonics games are organised by SOUND, not topic, so they don't use these.
window.MPacks = (function () {
  // Order here = order shown in the Set-up "Topic" menu.
  var PACKS = {
    everyday:   { label: '⭐ Everyday',        items: [['🐶','dog'],['🍎','apple'],['⚽','ball'],['🚗','car'],['☀️','sun'],['🏠','house'],['🥤','cup'],['⭐','star'],['🌸','flower'],['📕','book']] },
    animals:    { label: '🐶 Animals',         items: [['🐶','dog'],['🐱','cat'],['🐟','fish'],['🐦','bird'],['🐰','rabbit'],['🐸','frog'],['🦆','duck'],['🐮','cow'],['🐴','horse'],['🐷','pig']] },
    minibeasts: { label: '🐝 Minibeasts',      items: [['🐝','bee'],['🦋','butterfly'],['🕷️','spider'],['🐜','ant'],['🐞','ladybird'],['🐌','snail'],['🐛','caterpillar'],['🐢','tortoise']] },
    food:       { label: '🍎 Food',            items: [['🍎','apple'],['🍌','banana'],['🍰','cake'],['🍞','bread'],['🥚','egg'],['🥛','milk'],['🍕','pizza'],['🥕','carrot'],['🍓','strawberry'],['🧀','cheese']] },
    breakfast:  { label: '🥣 Breakfast',       items: [['🥣','cereal'],['🍞','toast'],['🥛','milk'],['🍳','egg'],['🧃','juice'],['🍌','banana'],['🥯','bagel'],['🍯','honey']] },
    dinner:     { label: '🍽️ Dinner',          items: [['🍕','pizza'],['🍝','pasta'],['🍗','chicken'],['🥦','broccoli'],['🥔','potato'],['🐟','fish'],['🍲','soup'],['🥗','salad']] },
    vehicles:   { label: '🚗 Vehicles',        items: [['🚗','car'],['🚌','bus'],['🚂','train'],['✈️','plane'],['🚲','bike'],['⛵','boat'],['🚚','truck'],['🚀','rocket'],['🚁','helicopter'],['🚒','fire engine']] },
    spring:     { label: '🌷 Spring',          items: [['🌷','flower'],['🌈','rainbow'],['☔','umbrella'],['🐣','chick'],['🐑','lamb'],['🐝','bee'],['🦋','butterfly'],['🌱','seed']] },
    summer:     { label: '☀️ Summer',          items: [['☀️','sun'],['🏖️','beach'],['🍦','ice cream'],['🐚','shell'],['🕶️','sunglasses'],['🪣','bucket'],['🩴','flip-flop'],['🍉','watermelon']] },
    autumn:     { label: '🍂 Autumn',          items: [['🍂','leaf'],['🌰','acorn'],['🍎','apple'],['🍄','mushroom'],['☔','umbrella'],['🎃','pumpkin'],['🦔','hedgehog'],['🌧️','rain']] },
    winter:     { label: '⛄ Winter',          items: [['⛄','snowman'],['❄️','snowflake'],['🧤','mittens'],['🧣','scarf'],['🎿','ski'],['☕','hot drink'],['🐧','penguin'],['🧥','coat']] },
    weather:    { label: '🌦️ Weather',         items: [['☀️','sun'],['🌧️','rain'],['☁️','cloud'],['🌈','rainbow'],['❄️','snow'],['💨','wind'],['⛈️','storm'],['🌫️','fog']] },
    family:     { label: '👪 People & family', items: [['👶','baby'],['👦','boy'],['👧','girl'],['👨','man'],['👩','woman'],['👵','grandma'],['👴','grandpa']] },
    jobs:       { label: '👷 People who help', items: [['👮','police officer'],['🚒','firefighter'],['🧑‍⚕️','doctor'],['🧑‍🏫','teacher'],['👷','builder'],['📮','postman'],['🧑‍🌾','farmer'],['🧑‍🍳','chef']] },
    home:       { label: '🏠 At home',         items: [['🛏️','bed'],['🪑','chair'],['🍽️','plate'],['🥄','spoon'],['🚪','door'],['🪟','window'],['💡','lamp'],['🛁','bath']] },
    school:     { label: '🏫 At school',       items: [['📕','book'],['✏️','pencil'],['🎒','bag'],['✂️','scissors'],['📏','ruler'],['🖍️','crayon'],['🪑','chair'],['🎨','paint']] },
    playground: { label: '🛝 Playground',      items: [['⚽','ball'],['🛝','slide'],['🪁','kite'],['🚲','bike'],['🧸','teddy'],['🪀','yo-yo'],['🦘','hop'],['🫧','bubbles']] },
    garden:     { label: '🌳 Garden',          items: [['🌷','flower'],['🌳','tree'],['🍃','leaf'],['🐦','bird'],['🐝','bee'],['🦋','butterfly'],['🐌','snail'],['🪴','plant']] },
    clothes:    { label: '👕 Clothes',         items: [['👕','shirt'],['👖','trousers'],['👟','shoes'],['🧢','hat'],['🧥','coat'],['🧦','socks'],['👗','dress'],['🧤','gloves']] },
    body:       { label: '🧍 My body',         items: [['✋','hand'],['🦶','foot'],['👁️','eye'],['👂','ear'],['👃','nose'],['👄','mouth'],['🦷','tooth'],['🦵','leg']] }
  };

  // Page theming per topic: a gradient for the banner, a light page tint, and
  // decorative emoji (default = the pack's own items). Falls back to everyday.
  var THEMES = {
    everyday:   { grad: 'linear-gradient(120deg,#e8f5ee,#d1fae5)', tint: '#f4faf6' },
    animals:    { grad: 'linear-gradient(120deg,#dcedc8,#aed581)', tint: '#f3f8ec' },
    minibeasts: { grad: 'linear-gradient(120deg,#e6eeda,#c5e1a5)', tint: '#f4f7ee' },
    food:       { grad: 'linear-gradient(120deg,#ffe0b2,#ffccbc)', tint: '#fff6ef' },
    breakfast:  { grad: 'linear-gradient(120deg,#fff3c4,#ffe0b2)', tint: '#fffaf0' },
    dinner:     { grad: 'linear-gradient(120deg,#ffccbc,#ffab91)', tint: '#fff3ef' },
    vehicles:   { grad: 'linear-gradient(120deg,#cfd8dc,#90a4ae)', tint: '#f4f6f7' },
    spring:     { grad: 'linear-gradient(120deg,#c8e6c9,#f8bbd0)', tint: '#f6fbf4' },
    summer:     { grad: 'linear-gradient(120deg,#ffe082,#4fc3f7)', tint: '#f1faff' },
    autumn:     { grad: 'linear-gradient(120deg,#ffcc80,#bcaaa4)', tint: '#fdf6ef' },
    winter:     { grad: 'linear-gradient(120deg,#e1f5fe,#b3e5fc)', tint: '#f2fbff' },
    weather:    { grad: 'linear-gradient(120deg,#cfe8f5,#b0bec5)', tint: '#f3f9fc' },
    family:     { grad: 'linear-gradient(120deg,#ffe0b2,#f8bbd0)', tint: '#fff7f3' },
    jobs:       { grad: 'linear-gradient(120deg,#d6e6f7,#b3cde0)', tint: '#f3f8fc' },
    home:       { grad: 'linear-gradient(120deg,#ffe0b2,#d7ccc8)', tint: '#fdf7f1' },
    school:     { grad: 'linear-gradient(120deg,#fff9c4,#c5cae9)', tint: '#fbfbf2' },
    playground: { grad: 'linear-gradient(120deg,#c8e6c9,#fff59d)', tint: '#f6fbf0' },
    garden:     { grad: 'linear-gradient(120deg,#dcedc8,#a5d6a7)', tint: '#f3f8ee' },
    clothes:    { grad: 'linear-gradient(120deg,#e1bee7,#b39ddb)', tint: '#f8f4fb' },
    body:       { grad: 'linear-gradient(120deg,#ffcdd2,#f8bbd0)', tint: '#fef5f6' }
  };
  var STORE = 'milestone.games.topic';

  function keys() { return Object.keys(PACKS); }
  function get(key) { var p = PACKS[key] || PACKS.everyday; return p.items; }
  function label(key) { return (PACKS[key] || PACKS.everyday).label; }
  // [{v,label}] for a Set-up control; pass a subset of keys, or omit for all.
  function options(only) {
    return (only && only.length ? only : keys()).filter(function (k) { return PACKS[k]; })
      .map(function (k) { return { v: k, label: PACKS[k].label }; });
  }
  function theme(key) {
    var t = THEMES[key] || THEMES.everyday;
    var emojis = (PACKS[key] || PACKS.everyday).items.map(function (it) { return it[0]; });
    return { grad: t.grad, tint: t.tint, emojis: emojis };
  }
  // The global topic chosen on the Games Centre, persisted so games default to it.
  function current() { try { var t = localStorage.getItem(STORE); if (t && PACKS[t]) return t; } catch (e) {} return 'everyday'; }
  function setCurrent(k) { try { if (PACKS[k]) localStorage.setItem(STORE, k); } catch (e) {} }

  return { keys: keys, get: get, label: label, options: options, theme: theme, current: current, setCurrent: setCurrent };
})();
