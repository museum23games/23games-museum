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
  function index() {
    if (!IDX) IDX = D.items.map(function (i) { return { i: i, n: " " + norm(i.title + " " + (i.ce || "")) + " ", t: norm(i.title) }; });
    return IDX;
  }
  function find(q, max) {
    var toks = norm(q).split(" ").filter(Boolean), plat = null;
    toks = toks.filter(function (t) { if (PLAT[t]) { plat = PLAT[t]; return false; } return true; });
    if (!toks.length) return [];
    var whole = toks.join(" "), out = [];
    index().forEach(function (x) {
      if (plat && x.i.platform !== plat) return;
      var s = 0;
      if (x.t === whole) s = 100; else if (x.t.indexOf(whole) === 0) s = 80;
      else if (toks.every(function (t) { return x.n.indexOf(" " + t) >= 0; })) s = 60;
      else if (toks.every(function (t) { return x.n.indexOf(t) >= 0; })) s = 40;
      if (!s) return;
      if (x.i.status === "owned") s += 5;
      if (!x.i.edition || x.i.edition === "Standard") s += 1;
      if (x.i.img) s += 8; if (x.i.flags.grail) s += 6; if (D.stories[x.i.id]) s += 4;   /* ties go to the plaque with the most to show */
      out.push([s - Math.min(x.t.length, 60) / 100, x.i]);
    });
    out.sort(function (a, b) { return b[0] - a[0] || a[1].id.localeCompare(b[1].id); });
    return out.slice(0, max || 8).map(function (r) { return r[1]; });
  }
  function wireSearch() {
    var box = document.getElementById("hero-search"), res = document.getElementById("sr"), cur = -1, list = [];
    if (!box) return;
    var draw = function () {
      var q = box.value.trim();
      if (!q) { res.innerHTML = ""; return; }
      list = find(q, 8); cur = list.length ? 0 : -1;
      res.innerHTML = list.length ? list.map(function (i, k) {
        return '<a class="hit' + (k === 0 ? " on" : "") + '" href="/i/' + esc(i.id) + '" data-link><b>' + esc(i.title) + '</b><span class="sm mu">' + itemLine(i) + (i.status === "hunting" ? " · still to find" : "") + "</span></a>";
      }).join("") : '<div class="hit none sm mu">No piece with that name yet. Try fewer words, or a platform such as ps2.</div>';
    };
    var mark = function () { [].forEach.call(res.querySelectorAll(".hit"), function (a, k) { a.classList.toggle("on", k === cur); }); };
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
    app.innerHTML = '<section class="hero"><h1>A museum of PlayStation.</h1><p>Games, consoles and the stories they carry, shelf by shelf. ' +
      '<b>' + num(D.quests.owned) + '</b> pieces are on our shelves today.</p>' +
      '<div class="search"><input id="hero-search" type="search" placeholder="Search a title, for example Martha Is Dead" aria-label="Search the museum" autocomplete="off"><div id="sr" class="results"></div></div>' +
      '<a class="cta" href="/shelves" data-link>Walk the shelves</a></section>';
    wireSearch();
  }

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
    app.innerHTML = '<p class="sm"><a href="' + (sh ? "/shelf/" + esc(sh.id) : "/shelves") + '" data-link>‹ ' + esc(sh ? sh.name : "Shelves") + "</a></p>" +
      '<div class="plaque"><div>' + (i.img ? '<img src="/img/' + esc(i.id) + '.jpg" alt="' + esc(i.title) + '">' : '<div class="ph">Photograph coming soon</div>') + "</div><div>" +
      "<h1>" + esc(i.title) + "</h1><div class=\"mu\">" + itemLine(i) + "</div>" +
      (i.status === "hunting" ? '<p><span class="chip">Still to find</span></p>' : "") +
      (i.flags.grail ? '<span class="chip gold">Holy Grail</span>' : "") + (i.flags.sealed ? '<span class="chip">Sealed</span>' : "") +
      (i.sentence ? '<p class="sentence">' + esc(i.sentence) + "</p>" : "") +
      (t ? '<div class="card" style="margin-top:16px"><b>The game’s tale</b>' + (t.rarity && t.rarity.note ? '<p class="sm">' + esc(t.rarity.note) + "</p>" : "") +
        (t.origin ? '<p class="sm">' + esc(t.origin) + "</p>" : "") + (t.reached ? '<p class="sm">' + esc(t.reached) + "</p>" : "") + "</div>" : "") +
      '<p class="mu sm" style="margin-top:18px">Piece ' + esc(i.id) + " · 23gamesdigital.com/i/" + esc(i.id) + "</p></div></div>";
  }

  function notFound() {
    document.title = "Not found · 23 Games Museum";
    app.innerHTML = '<h1>We can’t find that.</h1><p class="mu">The page or piece you asked for isn’t in the museum.</p><a class="cta" href="/" data-link>Back to the entrance</a>';
  }

  function route() {
    if (!D) return;
    var p = location.pathname.replace(/\/+$/, "") || "/", m, q = new URLSearchParams(location.search);
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
