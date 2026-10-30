/* 23 Games Museum: the public site. A read-only print: it fetches static JSON and draws it. It stores nothing and posts nothing.
   Routes (real paths; Netlify sends them all to index.html):  /   /shelves   /shelf/<id>   /i/<5-digit id> */
(function () {
  "use strict";
  var app = document.getElementById("app"), D = null, PAGE = 60;
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var num = function (n) { return Number(n || 0).toLocaleString("en-US"); };

  function load() {
    return Promise.all(["items", "collections", "quests", "stories", "memories"].map(function (n) {
      return fetch("/data/" + n + ".json").then(function (r) { if (!r.ok) { if (n === "memories") return { memories: [] }; throw new Error(n + " " + r.status); } return r.json(); });
    })).then(function (a) {
      var byId = {}; a[0].items.forEach(function (i) { byId[i.id] = i; });
      var cols = {}; a[1].collections.forEach(function (c) { cols[c.id] = c; });
      D = { items: a[0].items, byId: byId, cols: cols, collections: a[1].collections, quests: a[2], stories: a[3].stories || {}, memories: a[4].memories || [] };
    });
  }

  function itemLine(i) {
    return [i.edition && i.edition !== "Standard" ? esc(i.ce || i.edition) : "", esc(i.platform), esc(i.region), esc(i.year)].filter(Boolean).join(" · ");
  }

  /* ---- search: client-side over items.json; nothing is stored or sent anywhere ---- */
  var IDX = null, PLAT = { ps1: "PlayStation", psx: "PlayStation", ps2: "PlayStation 2", ps3: "PlayStation 3", ps4: "PlayStation 4", ps5: "PlayStation 5", psp: "PSP", vita: "PS Vita", psvita: "PS Vita" };
  var norm = function (t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim(); };
  /* what people type: abbreviations, digits for Roman numerals (and back), words run together, small typos */
  var ALIAS = { gta: "grand theft auto", pes: "pro evolution soccer", ff: "final fantasy", re: "resident evil", mgs: "metal gear solid", gow: "god of war", gt: "gran turismo",
    kh: "kingdom hearts", mk: "mortal kombat", cod: "call of duty", dmc: "devil may cry", tlou: "the last of us", nfs: "need for speed", tmnt: "teenage mutant ninja turtles", sh: "silent hill", fifa: "fifa" };
  var ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
  function variants(t) {
    var v = [t], n = /^\d{1,2}$/.test(t) ? +t : 0, r = ROMAN.indexOf(t);
    if (n >= 1 && n <= 20) v.push(ROMAN[n]);
    if (r > 1 && t !== "v" && t !== "x") v.push(String(r));
    return v;
  }
  var VOC = null;
  function index() {
    if (!IDX) {
      VOC = {};
      IDX = D.items.map(function (i) {
        var t = norm(i.title); t.split(" ").forEach(function (w) { if (w.length > 2) VOC[w] = (VOC[w] || 0) + 1; });
        return { i: i, n: " " + norm(i.title + " " + (i.ce || "")) + " ", t: t, c: t.replace(/ /g, "") };
      });
    }
    return IDX;
  }
  function dist(a, b, lim) {   /* edit distance, stops once it passes lim */
    if (Math.abs(a.length - b.length) > lim) return lim + 1;
    var p = [], c, i, j, m;
    for (j = 0; j <= b.length; j++) p[j] = j;
    for (i = 1; i <= a.length; i++) {
      c = [i]; m = i;
      for (j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (c[j] < m) m = c[j]; }
      if (m > lim) return lim + 1; p = c;
    }
    return p[b.length];
  }
  function correct(toks) {   /* fix words that start no title word; null if nothing could be fixed */
    var words = Object.keys(VOC), changed = false;
    var out = toks.map(function (t) {
      if (t.length < 3 || /^\d+$/.test(t) || words.some(function (w) { return w.indexOf(t) === 0; })) return t;
      var lim = t.length > 6 ? 2 : 1, best = null, bd = 9;
      words.forEach(function (w) { var d = dist(t, w, lim); if (d <= lim && (d < bd || (d === bd && VOC[w] > VOC[best]))) { best = w; bd = d; } });
      if (best) { changed = true; return best; }
      return t;
    });
    return changed ? out : null;
  }
  function run(toks, plat) {
    var whole = toks.join(" "), wholeV = toks.map(function (t) { return variants(t)[1] || t; }).join(" "), compact = whole.replace(/ /g, ""), out = [];
    var anyW = function (x, t) { return variants(t).some(function (v, k) { return x.n.indexOf(k ? " " + v + " " : " " + v) >= 0; }); };   /* what was typed may start a word; its Roman/Arabic twin must be the whole word */
    var anyC = function (x, t) { return /^\d+$/.test(t) ? anyW(x, t) : variants(t).some(function (v) { return x.n.indexOf(v) >= 0; }); };
    index().forEach(function (x) {
      if (plat && x.i.platform !== plat) return;
      var s = 0;
      if (x.t === whole || x.t === wholeV) s = 100; else if (x.t.indexOf(whole) === 0 || x.t.indexOf(wholeV) === 0) s = 60;   /* a title that starts with it ranks level with one that has it inside: owned and photographed first, then the newer game */
      else if (toks.every(function (t) { return anyW(x, t); })) s = 60;
      else if (toks.every(function (t) { return anyC(x, t); })) s = 40;
      if (compact.length > 4 && x.c.indexOf(compact) >= 0) s = Math.max(s, 60);   /* "spiderman" finds "Spider-Man" */
      if (!s) return;
      if (x.i.status === "owned") s += 5;
      if (!x.i.edition || x.i.edition === "Standard") s += 1;
      if (x.i.img) s += 8; if (x.i.flags.grail) s += 6; if (D.stories[x.i.id]) s += 4;   /* ties go to the plaque with the most to show */
      out.push([s, x.i, x.t.length]);
    });
    out.sort(function (a, b) { return b[0] - a[0] || String(b[1].year).localeCompare(String(a[1].year)) || a[2] - b[2] || a[1].id.localeCompare(b[1].id); });   /* equal matches: the newer game first, then the shorter title */
    return out;
  }
  function find(q, max) {
    var toks = [], plat = null, res;
    norm(q).split(" ").filter(Boolean).forEach(function (t) {
      var m = /^([a-z]+)(\d+)$/.exec(t);   /* "ff7" is "ff 7" */
      if (m && ALIAS[m[1]]) { toks = toks.concat(ALIAS[m[1]].split(" "), [m[2]]); return; }
      if (PLAT[t]) plat = PLAT[t]; else toks = toks.concat(ALIAS[t] ? ALIAS[t].split(" ") : [t]);
    });
    if (!toks.length) return [];
    index(); res = run(toks, plat);
    var fix = null;
    if (!res.length) { fix = correct(toks); if (fix) res = run(fix, plat); }
    var seen = {}, list = [];   /* the same game twice on one platform takes one slot (its other edition is on the shelf) */
    for (var k = 0; k < res.length && list.length < (max || 8); k++) {
      var it = res[k][1], key = norm(it.title) + "|" + it.platform + "|" + (it.edition || "");
      if (seen[key]) continue; seen[key] = 1; list.push(it);
    }
    list.fix = res.length && fix ? fix.join(" ") : null;
    return list;
  }
  function wireSearch() {
    var box = document.getElementById("hero-search"), res = document.getElementById("sr"), cur = -1, list = [];
    if (!box) return;
    var draw = function () {
      var q = box.value.trim();
      if (!q) { res.innerHTML = ""; return; }
      list = find(q, 10); cur = list.length ? 0 : -1;
      res.innerHTML = list.length ? (list.fix ? '<div class="hit none sm mu">Showing results for “' + esc(list.fix) + '”</div>' : "") + list.map(function (i, k) {
        return '<a class="hit' + (k === 0 ? " on" : "") + '" href="/i/' + esc(i.id) + '" data-link><b>' + esc(i.title) + '</b><span class="sm mu">' + itemLine(i) + (i.status === "hunting" ? " · still to find" : "") + "</span></a>";
      }).join("") : '<div class="hit none sm mu">No piece with that name yet. Try fewer words, or a platform such as ps2.</div>';
    };
    var mark = function () { [].forEach.call(res.querySelectorAll(".hit:not(.none)"), function (a, k) { a.classList.toggle("on", k === cur); }); };
    box.addEventListener("input", draw);
    box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && list.length) { e.preventDefault(); cur = (cur + 1) % list.length; mark(); }
      else if (e.key === "ArrowUp" && list.length) { e.preventDefault(); cur = (cur + list.length - 1) % list.length; mark(); }
      else if (e.key === "Enter") { e.preventDefault(); if (!list.length) draw(); if (list.length) { history.pushState(null, "", "/i/" + list[Math.max(cur, 0)].id); route(); } }
      else if (e.key === "Escape") { box.value = ""; draw(); }
    });
  }

  function home() {
    document.title = "23 Games Museum";
    var ch = (D.quests.chapters || []).filter(function (c) { return c.id === "ps2-us"; })[0], t = today();
    var latest = D.items.filter(function (i) { return i.status === "owned"; }).sort(function (a, b) { return b.id.localeCompare(a.id); }).slice(0, 5);
    app.innerHTML = '<section class="hero home"><div><div class="kick">Day ' + num(t.day) + ' of PlayStation</div><h1>Every game has a plaque. Every plaque can carry your memory.</h1>' +
      '<p>Search a game you played and find its plaque.</p>' +
      '<div class="search"><input id="hero-search" type="search" placeholder="Search a title, for example Martha Is Dead" aria-label="Search the museum" autocomplete="off"><div id="sr" class="results"></div></div></div>' +
      '<div class="side"><div class="kick">Latest to join</div>' + latest.map(function (i) { return '<a class="row" href="/i/' + esc(i.id) + '" data-link><span class="pos">#' + esc(i.id) + "</span><div><b>" + esc(i.title) + '</b><div class="sm mu">' + itemLine(i) + "</div></div></a>"; }).join("") +
      '<a class="sm quiet" href="/gallery" data-link>The gallery: the rooms, the shelves, the cabinets ›</a></div></section>' +
      '<div class="doors three"><a class="door pu" href="/shelves" data-link style="background-image:url(/img/site/photo3.jpg)"><b>Walk the shelves</b><span>Every platform, the way the real shelves stand</span></a>' +
      '<a class="door pk" href="/collections" data-link style="background-image:url(/img/site/welcome-wall.jpg)"><b>Feel the collections</b><span>Pieces from every shelf, kept together</span></a>' +
      '<a class="door gd" href="/memories" data-link style="background-image:url(/img/site/photo5.jpg)"><b>Memories we love</b><span>The Director’s, and the ones you leave on a plaque</span></a></div>' +
      (t.item ? todayCard(t.item) : "") +
      (ch ? '<a class="quest" href="/quest" data-link><div class="sm"><b>' + esc(ch.land) + "</b> · " + num(ch.have) + " of " + num(ch.goal) + ' found <span class="mu">· the Quest ›</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(100 * ch.have / ch.goal) + '%"></i></div></a>' : "") +
      '<p class="sm mu keepers">Soon: Keepers, the people who keep a game alive with us.</p>';
    wireSearch();
    var an = document.getElementById("another"); if (an) an.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); SHIFT++; home(); window.scrollTo(0, document.querySelector(".gotd").offsetTop - 80); });
  }

  /* Game of the day, the way the Curator shows it: the 23 Games kicker, the piece's photo, one line about it, the chips, two buttons */
  function todayCard(i) {
    var sh = i.shelf && D.cols[i.shelf.id], plat = PLATIMG[i.platform];
    return '<section class="gotd"' + (i.img ? ' style="background-image:url(/img/' + esc(i.id) + '.jpg)"' : "") + '><div class="gotd-in">' +
      (i.img ? '<a class="gotd-img" href="/i/' + esc(i.id) + '" data-link><img src="/img/' + esc(i.id) + '.jpg" alt=""></a>' : "") +
      '<div><div class="gotd-kick"><span class="rings"><i></i><i></i></span> 23 GAMES <span class="mu">· TODAY’S PLAQUE</span></div><h2>' + esc(i.title) + "</h2>" +
      '<div class="gotd-line">' + (plat ? '<img class="plat" src="/img/site/plat/' + plat + '.png" alt="' + esc(i.platform) + '">' : esc(i.platform)) + ' <span class="mu">' + esc([i.year, i.region, i.edition && i.edition !== "Standard" ? (i.ce || i.edition) : "Standard"].filter(Boolean).join(" · ")) + "</span></div>" +
      (i.sentence ? '<p class="sentence">' + esc(i.sentence) + "</p>" : i.desc ? '<p class="gotd-desc">' + esc(i.desc.text) + (i.desc.url ? ' <a class="sm" href="' + esc(i.desc.url) + '" target="_blank" rel="noopener">' + esc(i.desc.src) + "</a>" : "") + "</p>" : "") +
      (i.critic ? '<div class="gotd-critic"><b>' + i.critic + '</b><span class="mu">/100 critics</span></div>' : "") +
      '<div class="gotd-chips"><span class="chip">#' + esc(i.id) + "</span>" + (sh ? '<a class="chip" href="/shelf/' + esc(sh.id) + '" data-link>On the ' + esc(sh.name) + " shelf</a>" : "") + '<span class="chip">1 of ' + num(D.quests.owned) + " in the museum</span></div>" +
      '<div class="gotd-btn"><a class="cta" href="/i/' + esc(i.id) + '" data-link>See the plaque</a><a class="cta ghost" href="/" data-link id="another">Another game</a></div></div></div></section>';
  }
  var PLATIMG = { "PlayStation": "ps1", "PlayStation 2": "ps2", "PlayStation 3": "ps3", "PlayStation 4": "ps4", "PlayStation 5": "ps5", "PSP": "psp", "PS Vita": "psv", "Disney Infinity": "dis", "Lego Dimensions": "leg" };

  /* the small room at two in the morning (from the vision), in the museum's colours: it opens the memories */
  function room() {
    return '<a class="room" href="/memories" data-link aria-label="Memories we love">' +
      '<svg viewBox="0 0 620 426" aria-hidden="true"><g stroke="rgba(236,233,226,.08)" stroke-width="2"><line x1="40" y1="70" x2="250" y2="70"/><line x1="40" y1="120" x2="250" y2="120"/><line x1="40" y1="170" x2="250" y2="170"/></g>' +
      '<g fill="rgba(236,233,226,.12)"><rect x="48" y="44" width="8" height="24"/><rect x="60" y="44" width="8" height="24"/><rect x="72" y="46" width="8" height="22"/><rect x="84" y="44" width="8" height="24"/><rect x="100" y="44" width="8" height="24"/><rect x="112" y="44" width="8" height="24"/><rect x="128" y="46" width="8" height="22"/><rect x="48" y="94" width="8" height="24"/><rect x="60" y="94" width="8" height="24"/><rect x="76" y="94" width="8" height="24"/><rect x="92" y="96" width="8" height="22"/><rect x="104" y="94" width="8" height="24"/><rect x="48" y="144" width="8" height="24"/><rect x="64" y="144" width="8" height="24"/><rect x="76" y="144" width="8" height="24"/></g>' +
      '<rect x="230" y="110" width="200" height="150" rx="10" fill="#0b0d14" stroke="rgba(236,233,226,.18)" stroke-width="2"/><defs><linearGradient id="tvg" x1="0" x2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><rect class="tvglow" x="244" y="124" width="172" height="122" rx="4" fill="url(#tvg)" opacity=".85"/>' +
      '<defs><pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="rgba(0,0,0,.18)"/></pattern></defs><rect x="244" y="124" width="172" height="122" rx="4" fill="url(#scan)"/>' +
      '<text x="330" y="178" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="13" letter-spacing="2" fill="#1a0b2e">MEMORIES</text><text x="330" y="198" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="13" letter-spacing="2" fill="#1a0b2e">WE LOVE</text>' +
      '<ellipse cx="330" cy="330" rx="200" ry="40" fill="rgba(139,92,246,.10)"/><path d="M300 262 C 280 300, 230 310, 200 340" fill="none" stroke="rgba(236,233,226,.25)" stroke-width="2"/><path d="M360 262 C 380 300, 430 310, 460 340" fill="none" stroke="rgba(236,233,226,.25)" stroke-width="2"/>' +
      '<g class="pad1"><rect x="160" y="336" width="80" height="34" rx="14" fill="#1a1230" stroke="#c9a227" stroke-width="2"/><circle cx="178" cy="353" r="4" fill="#c9a227"/><circle cx="222" cy="353" r="4" fill="#c9a227"/></g>' +
      '<g class="pad2"><rect x="420" y="336" width="80" height="34" rx="14" fill="#1a1230" stroke="#c9a227" stroke-width="2"/><circle cx="438" cy="353" r="4" fill="#c9a227"/><circle cx="482" cy="353" r="4" fill="#c9a227"/></g>' +
      '<rect x="470" y="48" width="100" height="120" rx="4" fill="none" stroke="rgba(236,233,226,.14)" stroke-width="2"/><text x="520" y="124" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="800" font-size="46" fill="rgba(236,233,226,.22)" letter-spacing="-2">23</text>' +
      '<text x="330" y="36" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="11" letter-spacing="3" fill="#8d93a3">02:14 · SOMEONE’S SMALL ROOM</text></svg>' +
      '<div class="pass">if you lost, you <b>passed the controller</b></div></a>';
  }

  /* ---- the Quest: the chapters, what joined last, what is next ---- */
  function quest() {
    document.title = "The Quest · 23 Games Museum";
    var q = D.quests, chs = (q.chapters || []).slice().sort(function (a, b) { return (b.have / b.goal) - (a.have / a.goal); });
    var latest = D.items.filter(function (i) { return i.status === "owned"; }).sort(function (a, b) { return b.id.localeCompare(a.id); }).slice(0, 8);
    var next = D.items.filter(function (i) { return i.status === "hunting" && i.platform === "PlayStation 2" && i.region === "USA"; }).slice(0, 8);
    app.innerHTML = '<h1>' + esc(q.name || "The Quest") + '</h1><p class="mu">' + esc(q.sub || "") + "</p>" +
      '<p><b>' + num(q.owned) + '</b> pieces on the shelves · <b>' + num(q.hunting) + "</b> still to find</p>" +
      '<div class="chapters">' + chs.map(function (c) {
        return '<div class="card chap"><div class="kick">' + esc(c.land) + "</div><b>" + esc(c.name) + '</b><div class="sm mu">' + esc(c.about) + '</div><div class="sm" style="margin-top:8px">' + num(c.have) + " of " + num(c.goal) +
          '</div><div class="bar"><i style="width:' + Math.round(100 * c.have / Math.max(1, c.goal)) + '%"></i></div></div>';
      }).join("") + "</div>" +
      '<h2>Latest to join</h2><div class="grid">' + latest.map(tile).join("") + "</div>" +
      '<h2>The map of the Quest</h2><p class="sm mu">Every chapter is a land. The route runs from the first to the last; the flag is where the road ends for now.</p>' + questMap(q.chapters || []) +
      '<h2>What is next in the PS2 Kingdom</h2><p class="sm mu">The hunt list of the chapter we lead with. If you know where one of these is, tell us on its plaque.</p><div class="grid">' + next.map(tile).join("") + "</div>" +
      '<div class="card" style="margin-top:22px"><b>Help us in our quest</b><p class="sm mu">Every plaque has a place for your memory. If you know where a missing piece is, write it there. Keepers, the people who keep the museum alive with us, come later; nothing is for sale here.</p></div>';
  }
  /* the Quest map, as the Curator draws it: a winding route over islands, one land per chapter (ported from app72, in the museum's colours) */
  var MAPLOGO = { "ps2-us": "ps2", "ps1-longbox": "ps1", "ps1-black": "ps1", "ps1-gh": "ps1", "eas-vita": "psv", "ps4-consoles": "ps4", "psp-black": "psp", "psp-fav": "psp", lego: "leg", disney: "dis", "ps5-all": "ps5", "ps4": "ps4", "ps4-only": "ps4", "ps4-rest": "ps4", "nba-elite": "ps3", "ps3-fav-br": "ps3", "ps3-fav-la": "ps3", "ps1-rest": "ps1" };
  var ROMANNUM = function (n) { var t = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]], s = ""; t.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; };   /* (ROMAN, the array, belongs to the search) */
  function questMap(chs) {
    var portrait = window.innerWidth < 700, n = chs.length, W = portrait ? 620 : 1200, H = portrait ? 1720 : 900, cols = portrait ? 3 : 6, rows = Math.ceil(n / cols), top = 190, bottom = H - 250;
    var dx = (W - 200) / (cols - 1), dy = (bottom - top) / Math.max(1, rows - 1), pts = [];
    for (var i = 0; i < n; i++) { var r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; pts.push([100 + c * dx + Math.sin(i * 2.3) * (portrait ? 22 : 30), top + r * dy + Math.cos(i * 1.7) * (portrait ? 26 : 32)]); }
    var smooth = function (p, closed) {
      var P = closed ? [p[p.length - 1]].concat(p, [p[0], p[1]]) : [p[0]].concat(p, [p[p.length - 1]]), d = "M" + P[1][0].toFixed(1) + "," + P[1][1].toFixed(1);
      for (var k = 1; k < P.length - 2; k++) { var a = P[k - 1], b = P[k], cc = P[k + 1], e = P[k + 2]; d += " C" + (b[0] + (cc[0] - a[0]) / 6).toFixed(1) + "," + (b[1] + (cc[1] - a[1]) / 6).toFixed(1) + " " + (cc[0] - (e[0] - b[0]) / 6).toFixed(1) + "," + (cc[1] - (e[1] - b[1]) / 6).toFixed(1) + " " + cc[0].toFixed(1) + "," + cc[1].toFixed(1); }
      return d + (closed ? "Z" : "");
    };
    var island = function (ps, seed) {
      var cx = 0, cy = 0; ps.forEach(function (p) { cx += p[0] / ps.length; cy += p[1] / ps.length; });
      var rx = Math.max.apply(null, [100].concat(ps.map(function (p) { return Math.abs(p[0] - cx) + 72; }))), ry = Math.max.apply(null, [88].concat(ps.map(function (p) { return Math.abs(p[1] - cy) + 74; }))), ring = [];
      for (var k = 0; k < 14; k++) { var a = k / 14 * Math.PI * 2, w = 1 + 0.13 * Math.sin(k * 2.7 + seed) + 0.08 * Math.cos(k * 4.1 + seed * 1.3); ring.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]); }
      return smooth(ring, true);
    };
    var isl = []; for (var j = 0; j < pts.length; j += 3) isl.push(island(pts.slice(j, j + 3), j));
    var node = function (ch, k) {
      var x = pts[k][0], y = pts[k][1], pct = Math.round(100 * ch.have / Math.max(1, ch.goal)), done = ch.have >= ch.goal && ch.goal > 0, rr = 25, lg = MAPLOGO[ch.id], short = ch.land.replace(/^The /, "");
      return '<a href="/collections" data-link class="qn' + (done ? " done" : "") + '"><circle cx="' + x + '" cy="' + y + '" r="' + rr + '" class="qdot"/><text x="' + x + '" y="' + (y + 5) + '" class="qnum">' + (done ? "✓" : ROMANNUM(k + 1)) + "</text>" +
        (lg ? '<image href="/img/site/plat/' + lg + '.png" x="' + (x - 22) + '" y="' + (y + rr + 6) + '" width="44" height="18" preserveAspectRatio="xMidYMid meet" opacity=".9"/>' : "") +
        '<text x="' + x + '" y="' + (y + rr + (lg ? 40 : 22)) + '" class="qlab">' + esc(short.length > 24 ? short.slice(0, 23) + "…" : short) + '</text><text x="' + x + '" y="' + (y + rr + (lg ? 56 : 38)) + '" class="qpct">' + pct + "%</text></a>";
    };
    var last = pts[pts.length - 1];
    return '<svg class="qmap" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="The map of the Quest"><defs><radialGradient id="qsea" cx="45%" cy="40%" r="80%"><stop offset="0" stop-color="#2a1e5c"/><stop offset=".55" stop-color="#1b1438"/><stop offset="1" stop-color="#0d0b14"/></radialGradient>' +
      '<linearGradient id="qland" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a7a"/><stop offset="1" stop-color="#2a1f5c"/></linearGradient><pattern id="qgrid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/></pattern></defs>' +
      '<rect width="' + W + '" height="' + H + '" rx="22" fill="url(#qsea)"/><rect width="' + W + '" height="' + H + '" rx="22" fill="url(#qgrid)"/>' +
      isl.map(function (d) { return '<path d="' + d + '" fill="url(#qland)" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round" opacity=".95"/><path d="' + d + '" fill="none" stroke="rgba(167,139,250,.16)" stroke-width="16"/>'; }).join("") +
      '<path d="' + smooth(pts, false) + '" fill="none" stroke="rgba(245,215,110,.7)" stroke-width="4" stroke-dasharray="3 12" stroke-linecap="round"/>' +
      '<g transform="translate(' + (W - 80) + ',84)" opacity=".85"><circle r="44" fill="rgba(13,11,20,.55)" stroke="#a78bfa" stroke-width="2"/><path d="M0,-40 L8,0 L0,40 L-8,0Z" fill="#ece9f7"/><path d="M-40,0 L0,8 L40,0 L0,-8Z" fill="#a78bfa"/><text y="-50" class="qcmp">N</text></g>' +
      '<g transform="translate(' + (portrait ? 40 : 34) + "," + (H - 122) + ')"><rect width="270" height="92" rx="14" fill="rgba(13,11,20,.75)" stroke="rgba(167,139,250,.5)"/><image href="/img/site/plat/logo-mark.png" x="14" y="16" width="60" height="60" preserveAspectRatio="xMidYMid meet"/><text x="86" y="44" class="qbrand">23 GAMES</text><text x="86" y="68" class="qbrand2">The Quest</text></g>' +
      chs.map(node).join("") + '<text x="' + last[0] + '" y="' + (last[1] - 46) + '" class="qflag">🏁</text></svg>';
  }
  function tile(i) {
    return '<a class="card tile' + (i.status === "hunting" ? " hunt" : "") + '" href="/i/' + esc(i.id) + '" data-link>' + (i.img ? '<img src="/img/' + esc(i.id) + '_t.jpg" alt="" loading="lazy" onerror="this.remove()">' : "") + "<b>" + esc(i.title) + '</b><div class="sm mu">' + itemLine(i) + (i.status === "hunting" ? " · still to find" : "") + "</div></a>";
  }

  /* ---- the collections: pieces from every shelf, kept together ---- */
  function collections() {
    document.title = "Collections · 23 Games Museum";
    var cs = D.collections.filter(function (c) { return !c.shelf && c.count > 0; }).sort(function (a, b) { return b.count - a.count; });
    app.innerHTML = '<h1>Feel the collections</h1><p class="mu">A collection is a thread through the museum: pieces from different shelves and different rooms, kept together because they belong together.</p>' +
      '<div class="cgrid">' + cs.map(function (c, k) {
        return '<a class="ctile t' + (k % 4) + '" href="/collection/' + esc(c.id) + '" data-link><b>' + esc(c.name) + "</b><span>" + num(c.count) + " pieces</span>" + (c.description ? '<p class="sm">' + esc(c.description) + "</p>" : "") + "</a>";
      }).join("") + "</div>";
  }
  function collection(id) {
    var c = D.cols[id]; if (!c || c.shelf) return notFound();
    document.title = c.name + " · 23 Games Museum";
    var set = {}; (c.members || []).forEach(function (m) { set[m] = 1; });
    var list = D.items.filter(function (i) { return set[i.id]; }), own = list.filter(function (i) { return i.status === "owned"; }), hunt = list.filter(function (i) { return i.status !== "owned"; });
    app.innerHTML = '<p class="sm"><a href="/collections" data-link>‹ All collections</a></p><h1>' + esc(c.name) + "</h1>" + (c.description ? '<p class="mu">' + esc(c.description) + "</p>" : "") +
      '<p class="sm"><b>' + num(own.length) + "</b> on the shelves" + (hunt.length ? " · <b>" + num(hunt.length) + "</b> still to find" : "") + "</p>" +
      '<div class="grid">' + own.map(tile).join("") + hunt.map(tile).join("") + "</div>";
  }

  /* ---- memories we love and the gallery ---- */
  function memories(slug) {
    var ms = D.memories || [];
    if (slug) {
      var m = ms.filter(function (x) { return x.slug === slug; })[0]; if (!m) return notFound();
      document.title = m.title + " · 23 Games Museum";
      app.innerHTML = '<p class="sm"><a href="/memories" data-link>‹ Memories we love</a></p><div class="story"><div class="kick">From the Director</div><h1>' + esc(m.title) + "</h1>" + m.paragraphs.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>";
      return;
    }
    document.title = "Memories we love · 23 Games Museum";
    app.innerHTML = '<section class="hero home"><div><h1>Memories we love</h1><p>The museum keeps the box on the shelf and the evening it was played. The Director’s memories come first; yours go on the plaque of the game they happened with.</p></div><div class="roomcol">' + room() + "</div></section>" +
      '<h2>Memories from the Director</h2><div class="grid">' + ms.map(function (m) { return '<a class="card" href="/memory/' + esc(m.slug) + '" data-link><div class="kick">From the Director</div><b>' + esc(m.title) + '</b><p class="sm mu">' + esc((m.paragraphs[0] || "").slice(0, 140)) + "…</p></a>"; }).join("") + "</div>" +
      '<h2>Share your memory</h2><div class="card memory"><p class="sm mu">Which game was it? Start typing and pick it, or just write its name. We read every memory; the ones we can share will appear on that game’s plaque. Nothing is posted automatically.</p>' +
      '<form id="mf" name="memory" method="post"><input type="hidden" name="form-name" value="memory"><input type="hidden" name="item" id="mf-item" value="">' +
      '<p class="hp"><label>Leave empty <input name="bot-field"></label></p>' +
      '<label>The game<input name="game" id="mf-game" autocomplete="off" required maxlength="120" placeholder="For example Tekken 3"></label><div id="mf-sr" class="results"></div>' +
      '<label>Your memory<textarea name="memory" rows="4" required maxlength="1500"></textarea></label>' +
      '<div class="two"><label>Name or nickname<input name="nick" maxlength="60"></label><label>City<input name="city" maxlength="60"></label></div>' +
      '<div class="two"><label>Year it happened<input name="year" inputmode="numeric" maxlength="4"></label><label>Email, only if you want a reply<input name="email" type="email" maxlength="120"></label></div>' +
      '<button class="cta" type="submit">Send my memory</button><p class="sm mu" id="mm" role="status"></p></form></div>';
    wireMemory();
    var g = document.getElementById("mf-game"), sr = document.getElementById("mf-sr"), hid = document.getElementById("mf-item");
    g.addEventListener("input", function () {
      hid.value = ""; var q = g.value.trim(); if (q.length < 2) { sr.innerHTML = ""; return; }
      var list = find(q, 6); sr.innerHTML = list.map(function (i) { return '<a class="hit" href="#" data-id="' + esc(i.id) + '" data-t="' + esc(i.title) + '"><b>' + esc(i.title) + '</b><span class="sm mu">' + itemLine(i) + "</span></a>"; }).join("");
      [].forEach.call(sr.querySelectorAll(".hit"), function (a) { a.addEventListener("click", function (e) { e.preventDefault(); g.value = a.getAttribute("data-t"); hid.value = a.getAttribute("data-id"); sr.innerHTML = ""; }); });
    });
  }
  var GALLERY = [["welcome-room", "The room"], ["photo3", "The wall"], ["welcome-wall", "The cabinet"], ["photo1", "Shelves"], ["photo2", "Figures and boxes"], ["photo5", "Lights off"], ["photo4", "The corner"], ["photo6", "The cabinet again"], ["hero1", ""], ["hero2", ""], ["hero3", ""], ["hero4", ""], ["hero5", ""]];
  function galleryPage() {
    document.title = "Gallery · 23 Games Museum";
    app.innerHTML = '<h1>The gallery</h1><p class="mu">The rooms, the shelves and the cabinets as they stand.</p><div class="gal2">' +
      GALLERY.map(function (g) { return '<figure><img src="/img/site/' + g[0] + '.jpg" alt="' + esc(g[1]) + '" loading="lazy">' + (g[1] ? "<figcaption>" + esc(g[1]) + "</figcaption>" : "") + "</figure>"; }).join("") + "</div>";
  }

  /* the day count and today's plaque are the same for every visitor: they depend only on the date */
  function today() {
    var d = new Date(), utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), day = Math.floor((utc - Date.UTC(1994, 11, 3)) / 864e5);
    var pool = D.items.filter(function (i) { return i.status === "owned" && i.img; });   /* today's plaque always has the museum's own photo */
    if (!pool.length) pool = D.items.filter(function (i) { return i.status === "owned"; });
    return { day: day + OFFSET, item: pool.length ? pool[(day + SHIFT) % pool.length] : null };
  }
  var OFFSET = 0, SHIFT = 0;   /* "Another game" moves SHIFT for this visit only: nothing is stored */

  function shelves() {
    document.title = "Shelves · 23 Games Museum";
    var sh = D.collections.filter(function (c) { return c.shelf && c.count > 0; });
    app.innerHTML = '<h1>The shelves</h1><p class="mu">Each shelf holds one kind of piece, in the order they joined the museum.</p><div class="grid">' +
      sh.map(function (c) { return '<a class="card" href="/shelf/' + esc(c.id) + '" data-link><b>' + esc(c.name) + '</b><div class="sm mu">' + num(c.count) + ' pieces</div></a>'; }).join("") + "</div>";
  }

  function shelf(id, page) {
    var c = D.cols[id];
    if (!c || !c.shelf) return notFound();
    var list = D.items.filter(function (i) { return i.shelf && i.shelf.id === id; }).sort(function (a, b) { return a.shelf.pos - b.shelf.pos; });
    var pages = Math.max(1, Math.ceil(list.length / PAGE)); page = Math.min(Math.max(1, page || 1), pages);
    var slice = list.slice((page - 1) * PAGE, page * PAGE);
    document.title = c.name + " · 23 Games Museum";
    var pg = function (p, label, off) { return off ? '<span class="off">' + label + "</span>" : '<a href="/shelf/' + esc(id) + "?page=" + p + '" data-link>' + label + "</a>"; };
    app.innerHTML = '<p class="sm"><a href="/shelves" data-link>‹ All shelves</a></p><h1>' + esc(c.name) + '</h1><p class="mu">' + num(list.length) + " pieces · page " + page + " of " + pages + "</p>" +
      slice.map(function (i) {
        return '<div class="row"><span class="pos">' + num(i.shelf.pos) + '</span><div><a href="/i/' + esc(i.id) + '" data-link><b>' + esc(i.title) + "</b></a>" +
          (i.flags.grail ? '<span class="chip gold">Holy Grail</span>' : "") + (i.flags.sealed ? '<span class="chip">Sealed</span>' : "") + '<div class="sm mu">' + itemLine(i) + "</div></div></div>";
      }).join("") + '<div class="pager">' + pg(page - 1, "‹ Previous", page <= 1) + "<span>" + page + " / " + pages + "</span>" + pg(page + 1, "Next ›", page >= pages) + "</div>";
  }

  /* every photo of the piece, one under the other, all the same size: <id>.jpg first, then <id>_2.jpg, <id>_3.jpg ... */
  function gallery(i) {
    var n = i.imgs || 1, out = "";
    for (var k = 1; k <= n; k++) out += '<img src="/img/' + esc(i.id) + (k > 1 ? "_" + k : "") + '.jpg" alt="' + esc(i.title) + (n > 1 ? ", photo " + k + " of " + n : "") + '"' + (k > 1 ? ' loading="lazy"' : "") + ">";
    return out;
  }

  function plaque(id) {
    var i = D.byId[id];
    if (!i) return notFound();
    document.title = i.title + " · 23 Games Museum";
    var sh = i.shelf && D.cols[i.shelf.id], t = D.stories[id];
    var shelfLink = i.status === "hunting" ? '<a class="pm" href="/shelves" data-link><b>Still to find</b><span class="sm mu">This one is not on our shelves yet. It is on the hunt list.</span></a>'
      : sh ? '<a class="pm" href="/shelf/' + esc(sh.id) + '" data-link><b>See it on the shelf</b><span class="sm mu">' + esc(sh.name) + (i.flags.grand ? " · also in the Grand Hall" : "") + "</span></a>" : "";
    var yt = (i.links || []).filter(function (l) { return /youtu\.?be/.test(l.url); })[0], ytId = yt && (/[?&]v=([\w-]{6,})/.exec(yt.url) || /youtu\.be\/([\w-]{6,})/.exec(yt.url) || [])[1];
    var links = (i.links || []).filter(function (l) { return l !== yt; }).map(function (l) { return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || host(l.url)) + "</a>"; });
    links.push('<a href="https://en.wikipedia.org/w/index.php?search=' + encodeURIComponent(i.title + " video game") + '" target="_blank" rel="noopener">Wikipedia</a>');
    links.push('<a href="https://www.youtube.com/results?search_query=' + encodeURIComponent(i.title + " " + i.platform) + '" target="_blank" rel="noopener">YouTube</a>');
    app.innerHTML = '<p class="sm"><a href="' + (sh ? "/shelf/" + esc(sh.id) : "/shelves") + '" data-link>‹ ' + esc(sh ? sh.name : "Shelves") + "</a></p>" +
      '<div class="plaque"><div><div class="gal">' + (i.img ? gallery(i) : '<div class="ph">Photograph coming soon</div>') + "</div>" +
      '<div class="pmenu">' + shelfLink +
      (ytId ? '<div class="pm trailer" id="trailer" data-yt="' + esc(ytId) + '"><img src="https://i.ytimg.com/vi/' + esc(ytId) + '/hqdefault.jpg" alt="" loading="lazy"><b>▶ ' + esc(yt.label || "Trailer") + '</b><span class="sm mu">Plays here, from YouTube</span></div>' : "") +
      '<div class="pm links"><b>Links</b><span class="sm">' + links.join(" · ") + "</span></div></div></div>" +
      "<div>" + card(i) +
      (t ? '<div class="card" style="margin-top:16px"><b>The game’s tale</b>' + (t.rarity && t.rarity.note ? '<p class="sm">' + esc(t.rarity.note) + "</p>" : "") +
        (t.origin ? '<p class="sm">' + esc(t.origin) + "</p>" : "") + (t.reached ? '<p class="sm">' + esc(t.reached) + "</p>" : "") + "</div>" : "") +
      '<div class="card" style="margin-top:16px"><b>Memories shared</b><p class="sm mu">No memory shared on this plaque yet. Yours can be the first.</p></div>' +
      '<div class="card memory" style="margin-top:16px"><b>Share your memory</b>' +
      '<p class="sm mu">Did you play this one? Tell us where, when and who was with you. We read every memory; the ones we can share will appear on this plaque. Nothing is posted automatically.</p>' +
      '<form id="mf" name="memory" method="post">' +
      '<input type="hidden" name="form-name" value="memory"><input type="hidden" name="item" value="' + esc(i.id) + '">' +
      '<p class="hp"><label>Leave empty <input name="bot-field"></label></p>' +
      '<label>Your memory<textarea name="memory" rows="4" required maxlength="1500"></textarea></label>' +
      '<div class="two"><label>Name or nickname<input name="nick" maxlength="60"></label><label>City<input name="city" maxlength="60"></label></div>' +
      '<div class="two"><label>Year it happened<input name="year" inputmode="numeric" maxlength="4"></label><label>Email, only if you want a reply<input name="email" type="email" maxlength="120"></label></div>' +
      '<button class="cta" type="submit">Send my memory</button><p class="sm mu" id="mm" role="status"></p></form></div>' +
      "</div></div>";
    wireMemory(); fitCard();
    var tr = document.getElementById("trailer");
    if (tr) tr.addEventListener("click", function () {   /* nothing from YouTube loads until the visitor asks for it */
      tr.outerHTML = '<div class="pm trailer on"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(tr.getAttribute("data-yt")) + '?autoplay=1&rel=0" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    });
  }
  var host = function (u) { return String(u).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]; };

  /* ---- the plaque is the card: the back of the physical card (CR80, 85.6 x 54 mm), drawn from the museum's data on the same 1012 x 638 grid as card.py.
     Where the printed card has the QR code, the page has the 23 emblem (you are already on the plaque). Units: --u is one grid pixel. ---- */
  var PSHORT = { "PlayStation": "PS1", "PlayStation 2": "PS2", "PlayStation 3": "PS3", "PlayStation 4": "PS4", "PlayStation 5": "PS5", "PS Vita": "VITA" };
  function card(i) {
    var ed = i.edition && i.edition !== "Standard" ? (i.ce || i.edition) : "", kick = ed ? ed.toUpperCase() : "";
    var det = [i.year, i.publisher, i.num].filter(Boolean).map(esc).join("  ·  "), cont = i.contents ? [].concat(i.contents).map(esc).join(" · ") : "";
    var trophy = '<span class="pc-medal"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" fill="#c9a227" stroke="#c9a227" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg></span>';
    return '<div class="pc-wrap"><article class="pc" aria-label="Plaque: ' + esc(i.title) + '">' +
      '<header class="pc-head"><span class="pc-rings"><i></i><i></i></span><b class="pc-brand">23 GAMES</b><span class="pc-sub">M U S E U M</span>' +
      '<span class="pc-plat">' + esc([PSHORT[i.platform] || i.platform, i.region === "USA" ? "USA" : i.region].filter(Boolean).join("  ·  ")) + "</span></header><div class=\"pc-gold\"></div>" +
      ((kick || i.flags.grail) ? '<div class="pc-kick">' + (kick ? "<span>" + esc(kick) + "</span>" : "") + (i.flags.grail ? trophy + "<span>HOLY GRAIL</span>" : "") + "</div>" : "") +
      '<h1 class="pc-title" id="pc-title"><span>' + esc(i.title) + "</span></h1>" + (ed ? '<div class="pc-ed" id="pc-ed">' + esc(ed) + "</div>" : "") +
      (i.sentence ? '<p class="pc-sent">' + esc(i.sentence) + "</p>" : "") + '<div class="pc-rule"></div>' +
      (det ? '<div class="pc-det">' + det + "</div>" : "") + (cont ? '<div class="pc-cont">' + cont + "</div>" : "") + (i.flags.sealed ? '<div class="pc-seal">Sealed</div>' : "") +
      '<div class="pc-emb">' + (i.emblem && i.emblem.indexOf("23g.") !== 0 ? '<img src="/img/emblems/' + esc(i.emblem) + '" alt="">' : '<span class="pc-2">2</span><span class="pc-3">3</span>') + '</div><div class="pc-no">#' + esc(i.id) + '</div><div class="pc-cap">THE LIVING PLAQUE</div>' +
      '<footer class="pc-url">23gamesdigital.com</footer><footer class="pc-tag">ONE COLLECTION. ONE STORY. INFINITE PASSION.</footer><i class="pc-c1"></i><i class="pc-c2"></i></article>' +
      '<div class="pc-read">' + (i.sentence ? '<p class="sentence">' + esc(i.sentence) + "</p>" : "") + ((det || cont || i.flags.sealed) ? '<p class="mu sm">' + [det, cont, i.flags.sealed ? "Sealed" : ""].filter(Boolean).join("<br>") + "</p>" : "") + "</div></div>";   /* phones: the card's small print, readable */
  }
  function fitCard() {   /* long titles shrink (62 -> 38 px on the grid) and then wrap to two lines; a long edition name shrinks too */
    var t = document.getElementById("pc-title"), e = document.getElementById("pc-ed");
    if (t) {
      var sp = t.firstChild, sz = [62, 52, 44, 38], k = 0; t.style.whiteSpace = "nowrap"; t.style.setProperty("--fs", sz[0]);
      while (k < sz.length - 1 && sp.offsetWidth > t.clientWidth + 1) { k++; t.style.setProperty("--fs", sz[k]); }
      if (sp.offsetWidth > t.clientWidth + 1) {   /* two lines, as large as fits the title zone (the span is measured: a clipped flex box reports no overflow) */
        t.style.whiteSpace = "normal";
        var two = [38, 34, 30, 27, 24, 21]; for (var q = 0; q < two.length; q++) { t.style.setProperty("--fs", two[q]); if (sp.offsetHeight <= t.clientHeight + 1) break; }
      }
    }
    if (e) { var f = 30; e.style.whiteSpace = "nowrap"; e.style.setProperty("--fs", f); while (f > 20 && e.scrollWidth > e.clientWidth + 1) { f -= 2; e.style.setProperty("--fs", f); } }
  }
  window.addEventListener("resize", function () { fitCard(); });

  /* the one thing a visitor can send: a memory, posted to the Netlify Form "memory" (static twin in index.html); it is never stored in this page */
  function wireMemory() {
    var f = document.getElementById("mf"), msg = document.getElementById("mm");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = f.querySelector("button"); btn.disabled = true; msg.textContent = "Sending…";
      var body = new URLSearchParams(new FormData(f)).toString();
      var opts = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body };
      fetch("/", opts).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        f.innerHTML = '<p><b>Thank you.</b> Your memory has reached the museum. If we can share it, it will appear on this plaque.</p>';
      }).catch(function () { btn.disabled = false; msg.textContent = "That did not go through. Please try again in a moment."; });
    });
  }

  function notFound() {
    document.title = "Not found · 23 Games Museum";
    app.innerHTML = '<h1>We can’t find that.</h1><p class="mu">The page or piece you asked for isn’t in the museum.</p><a class="cta" href="/" data-link>Back to the entrance</a>';
  }

  function route() {
    if (!D) return;
    var p = location.pathname.replace(/\/+$/, "") || "/", m, q = new URLSearchParams(location.search);
    if ((m = /^\/item\/(\d{5})$/.exec(p))) { history.replaceState(null, "", "/i/" + m[1]); p = "/i/" + m[1]; }   /* the older QR address from earlier notes: one address, /i/<id> */
    if (p === "/index.html" || p === "/museum" || p === "/museum/index.html") { history.replaceState(null, "", "/"); p = "/"; }   /* the old installed app opens /index.html */
    if (p === "/") home();
    else if (p === "/shelves") shelves();
    else if (p === "/quest") quest();
    else if (p === "/collections") collections();
    else if ((m = /^\/collection\/([A-Za-z0-9_-]+)$/.exec(p))) collection(m[1]);
    else if (p === "/memories") memories();
    else if ((m = /^\/memory\/([a-z0-9-]+)$/.exec(p))) memories(m[1]);
    else if (p === "/gallery") galleryPage();
    else if ((m = /^\/shelf\/([A-Za-z0-9_-]+)$/.exec(p))) shelf(m[1], parseInt(q.get("page"), 10) || 1);
    else if ((m = /^\/i\/(\d{5})$/.exec(p))) plaque(m[1]);
    else notFound();
    window.scrollTo(0, 0);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-link]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); route();
  });
  window.addEventListener("popstate", route);
  load().then(route).catch(function () { app.innerHTML = '<h1>The museum is closed for a moment.</h1><p class="mu">Please try again in a little while.</p>'; });
})();
