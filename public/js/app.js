/* 23 Games Museum: the public site. A read-only print: it fetches static JSON and draws it. It stores nothing and posts nothing.
   Routes (real paths; Netlify sends them all to index.html):  /   /shelves   /shelf/<id>   /i/<5-digit id> */
(function () {
  "use strict";
  var app = document.getElementById("app"), D = null, PAGE = 60;
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var num = function (n) { return Number(n || 0).toLocaleString("en-US"); };

  function load() {
    return Promise.all(["items", "collections", "quests", "stories"].map(function (n) {
      return fetch("/data/" + n + ".json").then(function (r) { if (!r.ok) throw new Error(n + " " + r.status); return r.json(); });
    })).then(function (a) {
      var byId = {}; a[0].items.forEach(function (i) { byId[i.id] = i; });
      var cols = {}; a[1].collections.forEach(function (c) { cols[c.id] = c; });
      D = { items: a[0].items, byId: byId, cols: cols, collections: a[1].collections, quests: a[2], stories: a[3].stories || {} };
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
    app.innerHTML = '<section class="hero"><div class="kick">Day ' + num(t.day) + ' of PlayStation</div><h1>Every game has a plaque. Every plaque can carry your memory.</h1>' +
      '<p>Search a game you played and find its plaque.</p>' +
      '<div class="search"><input id="hero-search" type="search" placeholder="Search a title, for example Martha Is Dead" aria-label="Search the museum" autocomplete="off"><div id="sr" class="results"></div></div>' +
      '<a class="cta" href="/shelves" data-link>Walk the shelves</a></section>' +
      (t.item ? '<a class="card today" href="/i/' + esc(t.item.id) + '" data-link>' + (t.item.img ? '<img src="/img/' + esc(t.item.id) + '.jpg" alt="">' : "") +
        '<div><div class="kick">Today’s plaque</div><b>' + esc(t.item.title) + '</b><div class="sm mu">' + itemLine(t.item) + "</div></div></a>" : "") +
      (ch ? '<div class="quest"><div class="sm"><b>' + esc(ch.land) + "</b> · " + num(ch.have) + " of " + num(ch.goal) + " found</div>" +
        '<div class="bar"><i style="width:' + Math.round(100 * ch.have / ch.goal) + '%"></i></div></div>' : "") +
      '<p class="sm mu keepers">Soon: Keepers, the people who keep a game alive with us.</p>';
    wireSearch();
  }

  /* the day count and today's plaque are the same for every visitor: they depend only on the date */
  function today() {
    var d = new Date(), utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), day = Math.floor((utc - Date.UTC(1994, 11, 3)) / 864e5);
    var pool = D.items.filter(function (i) { return i.status === "owned" && (i.img || D.stories[i.id]); });
    if (!pool.length) pool = D.items.filter(function (i) { return i.status === "owned"; });
    return { day: day + OFFSET, item: pool.length ? pool[day % pool.length] : null };
  }
  var OFFSET = 0;

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

  function plaque(id) {
    var i = D.byId[id];
    if (!i) return notFound();
    document.title = i.title + " · 23 Games Museum";
    var sh = i.shelf && D.cols[i.shelf.id], t = D.stories[id];
    var ed = i.edition && i.edition !== "Standard" ? esc(i.ce || i.edition) : "";
    var det = [i.year, i.publisher].concat(i.contents ? [].concat(i.contents).join(" · ") : []).filter(Boolean).map(esc).join(" · ");
    app.innerHTML = '<p class="sm"><a href="' + (sh ? "/shelf/" + esc(sh.id) : "/shelves") + '" data-link>‹ ' + esc(sh ? sh.name : "Shelves") + "</a></p>" +
      '<div class="plaque"><div>' + (i.img ? '<img src="/img/' + esc(i.id) + '.jpg" alt="' + esc(i.title) + '">' : '<div class="ph">Photograph coming soon</div>') + "</div><div>" +
      '<div class="label"><div class="lk">' + esc([i.platform, i.region].filter(Boolean).join(" · ")) + (i.flags.grail ? " · Holy Grail" : "") + "</div>" +
      "<h1>" + esc(i.title) + "</h1>" + (ed ? '<div class="led">' + ed + "</div>" : "") +
      (i.status === "hunting" ? '<p class="lp">Still to find. This one is not on our shelves yet.</p>' : "") +
      (i.sentence ? '<p class="sentence">' + esc(i.sentence) + "</p>" : "") +
      (det || i.flags.sealed ? '<div class="ld">' + det + (i.flags.sealed ? (det ? " · " : "") + '<b class="gd">Sealed</b>' : "") + "</div>" : "") +
      '<div class="ln">#' + esc(i.id) + " · 23gamesdigital.com/i/" + esc(i.id) + "</div></div>" +
      (t ? '<div class="card" style="margin-top:16px"><b>The game’s tale</b>' + (t.rarity && t.rarity.note ? '<p class="sm">' + esc(t.rarity.note) + "</p>" : "") +
        (t.origin ? '<p class="sm">' + esc(t.origin) + "</p>" : "") + (t.reached ? '<p class="sm">' + esc(t.reached) + "</p>" : "") + "</div>" : "") +
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
    wireMemory();
  }

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
    if (p === "/index.html" || p === "/museum" || p === "/museum/index.html") { history.replaceState(null, "", "/"); p = "/"; }   /* the old installed app opens /index.html */
    if (p === "/") home();
    else if (p === "/shelves") shelves();
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
