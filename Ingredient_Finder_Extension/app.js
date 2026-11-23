(function () {
  document.head.insertAdjacentHTML("beforeend", "<style>" + IF.css + "</style>");
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var RESULTS = [], SLOTS = [];

  $("#mp").innerHTML = Object.keys(IF.MP).map(function (d) { return '<option value="' + d + '">' + IF.MP[d] + ", " + d + "</option>"; }).join("");

  function parseInput(line, def) {
    var m = line.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Za-z0-9]{10})/);
    if (m) {
      var host = "";
      try { host = new URL(/^https?:/.test(line) ? line : "https://" + line).hostname.replace(/^(www|smile|m)\./, ""); } catch (e) {}
      return {asin: m[1].toUpperCase(), domain: IF.MP[host] ? host : def};
    }
    if (/^[A-Za-z0-9]{10}$/.test(line)) return {asin: line.toUpperCase(), domain: def};
    return null;
  }

  async function fetchProduct(asin, domain) {
    var url = "https://www." + domain + "/dp/" + asin + "?th=1&psc=1";
    var base = {asin: asin, domain: domain, marketplace: IF.MP[domain], url: "https://www." + domain + "/dp/" + asin};
    for (var attempt = 0; attempt < 2; attempt++) {
      var res;
      try { res = await fetch(url, {credentials: "include", cache: "no-store"}); }
      catch (e) { return Object.assign(base, {status: "error", message: "Could not reach " + domain + ". Check your internet connection, then press Retry."}); }
      if (res.status === 404) return Object.assign(base, {status: "not_found", message: "This ASIN has no product page on " + domain + ". Check the ASIN or pick another marketplace."});
      var raw = await res.text();
      var doc = new DOMParser().parseFromString(raw, "text/html");
      var r = IF.extract(doc, url, raw);
      if (r.status === "ok") {
        pageMeta(doc, r);
        r.asin = r.asin || asin; r.domain = r.domain || domain; r.marketplace = IF.MP[r.domain] || ""; r.url = base.url;
        return r;
      }
      if (attempt === 0) await sleep(2500);
    }
    return Object.assign(base, {status: "blocked", message: "Amazon showed a robot check instead of the product. Open " + domain + " in a normal tab, solve the check once, then press Retry."});
  }

  function num(t) {
    t = String(t == null ? "" : t).replace(/[^\d.,]/g, "");
    if (!t) return NaN;
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
    return parseFloat(t);
  }
  function countNum(t) {
    var m = String(t || "").match(/([\d.,]+)\s*([KkMm])?(?![a-z])/);
    if (!m) return NaN;
    if (m[2]) return num(m[1]) * (/k/i.test(m[2]) ? 1000 : 1000000);
    return parseInt(m[1].replace(/[^\d]/g, ""), 10);
  }
  function pageMeta(doc, r) {
    var pe = doc.querySelector("#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen, #apex_desktop .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen");
    r.price = pe ? pe.textContent.trim() : "";
    var re = doc.querySelector("#acrPopover"), rt = re ? (re.getAttribute("title") || re.textContent || "") : "";
    r.rating = num((rt.match(/[\d.,]+/) || [])[0]);
    var rc = doc.querySelector("#acrCustomerReviewText");
    r.reviews = rc ? countNum(rc.textContent) : NaN;
  }

  function loadingCard(text, i, n) {
    return '<article class="facts loading"><h2>Reading</h2><p class="asin">' + esc(text) + '</p><p class="ptitle">Product ' + i + " of " + n + '</p><div class="pulse"></div></article>';
  }

  function render(i) {
    var r = RESULTS[i], slot = SLOTS[i];
    slot.innerHTML = IF.card(r);
    var art = slot.querySelector("article");
    var tools = art.querySelector(".tools");
    if (!tools) { tools = document.createElement("div"); tools.className = "tools"; art.appendChild(tools); }
    var extra = "";
    if (r.status === "ok" && r.final) extra += '<button type="button" data-act="copy">Copy ingredients</button>';
    if (r.status === "ok") extra += '<button type="button" class="primary" data-act="compare">Compare with similar products</button>';
    if (r.status === "ok" && (r.photos || []).length) extra += '<button type="button" data-act="label">' + (r.label ? "Read label photos again" : "Read label photos") + "</button>";
    if (r.status !== "ok") extra += '<button type="button" data-act="retry">Retry</button>' + (r.url ? '<a class="btn" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open on Amazon</a>' : "");
    tools.insertAdjacentHTML("afterbegin", extra);
    if (r.source_site) {
      var a = art.querySelector(".asin"); if (a) a.textContent = "From " + r.source_site;
      art.querySelectorAll("a.btn").forEach(function (b) { if (/Open on Amazon/.test(b.textContent)) b.textContent = "Open page"; });
    }
    var h2 = art.querySelector(".hint2");
    if (h2) h2.textContent = "The tool looks for the supplement facts label in these photos. Press Read label photos to look again.";
    tools.insertAdjacentHTML("afterend", '<p class="lstat" role="status">' + esc(r.label_note || "") + "</p>");

    if (r.facts_from === "label") {
      var h = Array.prototype.find.call(art.querySelectorAll("h3.sub"), function (x) { return x.textContent === "Supplement facts"; });
      var table = art.querySelector("table.sf");
      if (h && table) {
        table.classList.add("edit");
        table.insertAdjacentHTML("afterend", '<p class="labnote">Read by computer from <a href="' + esc(r.label.photo) + '" target="_blank" rel="noopener">this label photo</a>. Check the numbers against the photo and click any cell to fix it.</p>');
        Array.prototype.forEach.call(table.rows, function (tr, ri) {
          Array.prototype.forEach.call(tr.cells, function (td, ci) {
            td.contentEditable = "true";
            td.addEventListener("input", function () { if (r.facts_table[ri]) r.facts_table[ri][ci] = td.textContent.trim(); });
          });
        });
      }
    }

    slot.querySelectorAll("[data-act]").forEach(function (el) {
      var act = el.getAttribute("data-act");
      if (act === "copy") el.onclick = function () {
        navigator.clipboard.writeText(r.final.list.join(", ")).then(function () { el.textContent = "Copied"; setTimeout(function () { el.textContent = "Copy ingredients"; }, 1500); });
      };
      if (act === "label") el.onclick = function () { readLabel(i); };
      if (act === "compare") el.onclick = function () { openCompare(RESULTS[i]); };
      if (act === "retry") el.onclick = async function () {
        slot.innerHTML = loadingCard(r.asin, i + 1, RESULTS.length);
        RESULTS[i] = await fetchProduct(r.asin, r.domain);
        render(i); summary();
        if ($("#auto").checked && needsLabel(RESULTS[i])) await readLabel(i);
      };
    });
  }

  function needsLabel(r) { return r.status === "ok" && !(r.facts_table || []).length && (r.photos || []).length; }

  async function readLabel(i) {
    var r = RESULTS[i], slot = SLOTS[i];
    var btn = slot.querySelector('[data-act="label"]'); if (btn) btn.disabled = true;
    var setS = function (t) { var e = slot.querySelector(".lstat"); if (e) e.textContent = t; };
    await applyLabel(r, setS);
    render(i); summary();
  }

  async function applyLabel(r, setS) {
    try {
      var best = await IFOCR.findLabel(r, setS);
      if (!best) r.label_note = "No supplement facts panel was found in the product photos.";
      else {
        var p = best.parsed;
        r.label = {photo: best.url, raw: best.text};
        r.label_note = "";
        if (p.rows.length) { r.facts_table = p.rows; r.facts_from = "label"; }
        if (p.serving) r.facts_text = [p.serving].concat((r.facts_text || []).filter(function (x) { return x !== p.serving; }));
        if (p.ingredients) {
          if (!r.final) r.final = {text: p.ingredients, list: IF.splitIngredients(p.ingredients), source: "Label photo", confidence: "Medium"};
          else if (!r.candidates.some(function (c) { return c.source === "Label photo"; })) r.candidates.push({source: "Label photo", label: "Ingredients", text: p.ingredients, priority: 2});
        }
        if (!p.rows.length) r.label_note = "The label photo has ingredients but no amount rows.";
      }
    } catch (e) {
      r.label_note = "Reading the photos failed. " + (e && e.message ? e.message : e);
    }
  }

  function summary() {
    var done = RESULTS.filter(Boolean);
    var ok = done.filter(function (r) { return r.status === "ok" && r.final; }).length;
    var bad = done.filter(function (r) { return r.status !== "ok"; }).length;
    $("#summary").textContent = done.length ? ok + " of " + done.length + " with ingredients" + (bad ? ", " + bad + " need attention" : "") : "";
  }

  async function run(e) {
    if (e) e.preventDefault();
    var def = $("#mp").value, seen = {}, items = [];
    $("#asins").value.split(/[\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (line) {
      var it = parseInput(line, def);
      if (it && !seen[it.asin + it.domain]) { seen[it.asin + it.domain] = 1; items.push(it); }
    });
    $("#formmsg").textContent = "";
    if (!items.length) { $("#formmsg").textContent = "Add at least one ASIN or Amazon product link."; return; }
    RESULTS = []; SLOTS = []; $("#results").innerHTML = ""; summary();
    $("#run").disabled = true; $("#run").textContent = "Finding...";
    for (var i = 0; i < items.length; i++) {
      var slot = document.createElement("div");
      SLOTS[i] = slot; slot.innerHTML = loadingCard(items[i].asin + " on " + items[i].domain, i + 1, items.length);
      $("#results").appendChild(slot);
      RESULTS[i] = await fetchProduct(items[i].asin, items[i].domain);
      render(i); summary();
      if ($("#auto").checked && needsLabel(RESULTS[i])) await readLabel(i);
      if (i < items.length - 1) await sleep(1200 + Math.random() * 1200);
    }
    $("#run").disabled = false; $("#run").textContent = "Find ingredients";
  }

  // ---------------------------------------------------------------- comparison
  var CMP = {base: null, items: [], csv: ""};
  $("#cmpMp").innerHTML = Object.keys(IF.MP).map(function (d) { return '<option value="' + d + '">' + IF.MP[d] + ", " + d + "</option>"; }).join("");
  $("#cmpClose").onclick = function () { $("#cmp").hidden = true; };
  function whereMode() { return document.querySelector('input[name="where"]:checked').value; }
  function syncWhere() {
    var m = whereMode();
    $("#webQL").hidden = m === "amazon";
    $("#amzQL").hidden = m === "web";
  }
  document.querySelectorAll('input[name="where"]').forEach(function (x) { x.addEventListener("change", syncWhere); });
  syncWhere();
  function webQueries(r) {
    var main = mainNutrients(r).join(" ").replace(/\bvit([a-z]\d*)\b/g, "vitamin $1");
    var form = ((r.key_fields || {})["Item form"] || "").split(",")[0].trim();
    if (!form) { var fm = (r.title || "").match(/\b(capsules?|tablets?|gummies|gummy|powder|softgels?|drops|liquid|tea)\b/i); form = fm ? fm[1] : ""; }
    var q1 = $("#cmpWebQuery").value.trim() || webQuery(r);
    return [q1, (main + " " + form + " supplement buy").replace(/\s+/g, " ").trim(), (main + " supplement shop").trim()]
      .filter(function (q, i, a) { return q && a.indexOf(q) === i; });
  }
  function webQuery(r) {
    var mainN = mainNutrients(r).join(" ").replace(/\bvit([a-z]\d*)\b/g, "vitamin $1");
    var names = (r.facts_table || []).map(function (row) { return (row[0] || "").replace(/\(.*?\)/g, "").trim(); })
      .filter(function (x) { return x && !/^(serving|providing|total|calories|energy)/i.test(x); }).slice(0, 3);
    var base = names.length ? names.join(" ") : (mainN || guessQuery(r));
    var form = ((r.key_fields || {})["Item form"] || "").split(",")[0];
    return (base + " " + form + " supplement").replace(/\s+/g, " ").trim();
  }

  function guessQuery(r) {
    var kf = r.key_fields || {};
    if (kf["Primary supplement type"]) return (kf["Primary supplement type"].split(",").slice(0, 2).join(" ") + " " + (kf["Item form"] || "")).trim();
    var brand = (r.brand || "").replace(/^(visit the|brand:|marke:|marque\s*:|marca:)\s*/i, "").replace(/\s+store$/i, "").trim().toLowerCase();
    var words = (r.title || "").replace(/[,|()\[\]]/g, " ").split(/\s+/).filter(function (w) {
      var l = w.toLowerCase();
      return w && !/\d/.test(w) && l.length > 1 && (!brand || brand.indexOf(l) < 0) && !/^(and|with|for|the|of|in|per|count|pack|mg|mcg|und|mit|für|avec|pour|con|per)$/.test(l);
    });
    return words.slice(0, 5).join(" ");
  }

  function openCompare(r) {
    CMP.base = r;
    $("#cmp").hidden = false;
    $("#cmpFor").textContent = "Your product: " + (r.title || r.asin || "");
    $("#cmpQuery").value = guessQuery(r);
    $("#cmpWebQuery").value = webQuery(r);
    CMP.items = [r];
    if (chrome.storage) chrome.storage.local.set({cmp_base: r, cmp_items: [r]});
    $("#cmpMp").value = r.domain || $("#mp").value;
    $("#cmpOut").innerHTML = ""; $("#cmpStatus").textContent = ""; $("#cmpCsv").disabled = true;
    $("#cmp").scrollIntoView({behavior: "smooth"});
  }

  async function searchTop(domain, query, n, exclude) {
    var res = await fetch("https://www." + domain + "/s?k=" + encodeURIComponent(query), {credentials: "include", cache: "no-store"});
    var raw = await res.text();
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var seen = {}, items = [];
    doc.querySelectorAll('div[data-component-type="s-search-result"][data-asin]').forEach(function (el) {
      var asin = el.getAttribute("data-asin");
      if (!asin || seen[asin] || exclude.indexOf(asin) >= 0) return;
      seen[asin] = 1;
      var sponsored = !!el.querySelector(".puis-sponsored-label-text, .s-sponsored-label-text") ||
        /(^|\s)(Sponsored|Gesponsert|Sponsorisé|Sponsorizzato|Patrocinado|Gesponsord|Sponsrad|Sponsorowane)(\s|$)/.test((el.textContent || "").slice(0, 4000));
      if (sponsored) return;
      var h2 = el.querySelector("h2"), ra = el.querySelector("span.a-icon-alt");
      var rv = el.querySelector('a[href*="customerReviews"] span, span[aria-label$="ratings"], span[aria-label$="Bewertungen"], span.s-underline-text');
      items.push({asin: asin, title: h2 ? h2.textContent.trim() : "",
        rating: num(((ra ? ra.textContent : "").match(/[\d.,]+/) || [])[0]),
        reviews: rv ? countNum(rv.getAttribute("aria-label") || rv.textContent) : NaN});
    });
    if (!items.length) {
      if (/validatecaptcha|enter the characters you see below/i.test(raw)) throw new Error("Amazon showed a robot check on the search. Open " + domain + " in a normal tab, solve it once, and try again.");
      throw new Error("No products came back for this search. Try a shorter search.");
    }
    var score = function (x) { return (x.rating || 0) * Math.log10((x.reviews || 0) + 1); };
    return items.slice(0, 16).sort(function (a, b) { return score(b) - score(a); }).slice(0, n);
  }

  function toMg(s) {
    var t = String(s || "");
    t = /\d,\d{3}(?!\d)/.test(t) ? t.replace(/(\d),(\d{3})(?!\d)/g, "$1$2") : t.replace(/(\d),(\d)/g, "$1.$2");
    var m = t.match(/([\d.]+)\s*(mg|mcg|µg|μg|ug|g|iu|i\.u\.|cfu|billion cfu|kcal|kj)(?![a-z])/i);
    if (!m) return null;
    var v = parseFloat(m[1]), u = m[2].toLowerCase().replace(/\./g, "");
    if (/^(mcg|µg|μg|ug)$/.test(u)) { v = v / 1000; u = "mg"; } else if (u === "g") { v = v * 1000; u = "mg"; }
    return {v: v, u: u};
  }
  function fmt(v) { return v >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100); }
  function nameKey(n) {
    return n.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\b(as|from|providing|elemental|total|pure)\b/g, " ")
      .replace(/[^a-z0-9à-ÿ ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function pool(r) {
    return [].concat(r.facts_text || [], (r.facts_table || []).map(function (x) { return x.join(" "); }), r.bullets || [], r.directions || [],
      (r.details || []).map(function (d) { return d.label + ": " + d.value; }), (r.other_info || []).map(function (o) { return o.label + ": " + o.text; })).join(" | ");
  }
  function servings(r) {
    var all = pool(r);
    var m = all.match(/servings? per (?:container|bottle|pack)\s*[:：]?\s*(\d+)/i);
    if (m) return parseInt(m[1], 10);
    var sv = all.match(/serving size\s*[:：]?\s*(\d+)/i) || all.match(/(?:portion|dose|porzione|porci[oó]n|tagesdosis)\w*\s*[:：]?\s*(\d+)/i);
    var unit = num((r.key_fields || {})["Unit count"]);
    if (sv && unit) { var k = parseInt(sv[1], 10); if (k) return Math.floor(unit / k); }
    return NaN;
  }
  function servingText(r) {
    var m = pool(r).match(/(?:serving size|portion size|tagesdosis|portion|dose journali[eè]re|porzione|porci[oó]n)\s*[:：]?\s*(\d+(?:[.,]\d+)?\s*[A-Za-zÀ-ÿ]+(?:\s[A-Za-zÀ-ÿ]+)?)/i);
    return m ? m[1].replace(/\s+(supplement|servings?|amount|per)$/i, "") : "";
  }
  function otherIngredients(r) {
    if (!r.final) return null;
    if (/^(other|inactive|non medicinal)\s+ingredients?\s*[:：]/i.test(r.final.text)) return r.final.list.slice();
    var list = r.final.list, idx = list.findIndex(function (x) { return /^(other|inactive|sonstige|autres|altri|otros)\s+\w*\s*[:：]/i.test(x); });
    if (idx < 0) return null;
    var rest = list.slice(idx); rest[0] = rest[0].replace(/^[^:：]+[:：]\s*/, "");
    return rest.filter(Boolean);
  }
  function short(t, n) { t = String(t || ""); return t.length > n ? t.slice(0, n - 1) + "…" : t; }

  function buildTable(products) {
    var esc2 = esc, cols = products.length;
    var rows = [], wins = products.map(function () { return 0; }), winRows = products.map(function () { return []; });
    var cell = function (vals, better, label) {
      var nums = vals.map(function (v) { return v && typeof v.n === "number" && isFinite(v.n) ? v.n : null; });
      var have = nums.filter(function (x) { return x !== null; });
      var best = null;
      if (better && have.length >= 2) best = better === "high" ? Math.max.apply(null, have) : Math.min.apply(null, have);
      var bestCount = best === null ? 0 : nums.filter(function (x) { return x === best; }).length;
      return vals.map(function (v, k) {
        var win = best !== null && nums[k] === best && bestCount < have.length;
        if (win) { wins[k]++; winRows[k].push(label); }
        var txt = v && v.t ? v.t : "";
        return '<td class="' + (win ? "win" : "") + (txt ? "" : " na") + '">' + esc2(txt || "not listed") + "</td>";
      }).join("");
    };
    var add = function (label, vals, better) { rows.push("<tr><td>" + esc2(label) + "</td>" + cell(vals, better, label) + "</tr>"); };
    var sec = function (t) { rows.push('<tr class="sec"><td colspan="' + (cols + 1) + '">' + esc2(t) + "</td></tr>"); };

    var pps = products.map(function (r) { var p = num(r.price), s = servings(r); return p && s ? p / s : NaN; });
    sec("Basics");
    add("Sold on", products.map(function (r) { return {t: r.source_site || r.domain || ""}; }), null);
    add("Match with your product", products.map(function (r, k) {
      if (k === 0) return {t: "Your product"};
      if (!(r.facts_table || []).length || !(products[0].facts_table || []).length) return {t: "Same main ingredient (" + mainNutrients(products[0]).join(", ") + ")"};
      return {t: matchScore(products[0], r) + "%"};
    }), null);
    add("Price", products.map(function (r) { return {t: r.price || "", n: num(r.price)}; }), null);
    add("Rating", products.map(function (r) { return {t: isFinite(r.rating) ? r.rating + " of 5" : "", n: r.rating}; }), "high");
    add("Reviews", products.map(function (r) { return {t: isFinite(r.reviews) ? Number(r.reviews).toLocaleString() : "", n: r.reviews}; }), "high");
    add("Serving size", products.map(function (r) { return {t: servingText(r)}; }), null);
    add("Servings per pack", products.map(function (r) { var s = servings(r); return {t: isFinite(s) ? String(s) : "", n: s}; }), null);
    add("Price per serving", products.map(function (r, k) { return {t: isFinite(pps[k]) ? fmt(pps[k]) : "", n: pps[k]}; }), "low");
    add("Item form", products.map(function (r) { return {t: (r.key_fields || {})["Item form"] || ""}; }), null);
    add("Amount in product name", products.map(function (r) {
      var m = (r.title || "").match(/(\d[\d,.]*)\s?(mg|mcg|µg|g|iu)\b/i), a = m ? toMg(m[0]) : null;
      return {t: m ? m[0] : "", n: a ? a.v : null};
    }), null);
    add("Ingredient forms", products.map(function (r) { var f = formsOf(r); return {t: f.join(", "), n: f.length || null}; }), null);
    add("Diet type", products.map(function (r) { return {t: (r.key_fields || {})["Diet type"] || ""}; }), null);
    add("Allergen information", products.map(function (r) { return {t: (r.key_fields || {})["Allergen information"] || ""}; }), null);

    var keys = [], label = {}, per = products.map(function () { return {}; });
    products.forEach(function (r, k) {
      (r.facts_table || []).forEach(function (row) {
        var nm = row[0] || "", a = toMg(row.slice(1).join(" ")), key = nameKey(nm);
        if (!key || !a || /^(serving|servings|amount|calories|energy)/.test(key)) return;
        if (!label[key]) { label[key] = nm.replace(/\s+/g, " "); keys.push(key); }
        if (!per[k][key]) per[k][key] = {t: fmt(a.v) + " " + a.u, n: a.v, u: a.u};
      });
    });
    if (keys.length) {
      sec("Amount per serving");
      keys.slice(0, 40).forEach(function (key) {
        var mine = per[0][key];
        var vals = products.map(function (r, k) {
          var v = per[k][key];
          if (!v) return null;
          if (k > 0 && mine && mine.u === v.u && mine.n !== v.n) {
            var d = v.n - mine.n;
            return {t: v.t + ", " + fmt(Math.abs(d)) + " " + v.u + (d > 0 ? " more" : " less"), n: v.n, u: v.u};
          }
          if (k > 0 && !mine && Object.keys(per[0]).length) return {t: v.t + ", extra", n: v.n, u: v.u};
          return v;
        });
        var units = vals.filter(Boolean).map(function (v) { return v.u; });
        var same = units.every(function (u) { return u === units[0]; });
        add(label[key], vals, same ? "high" : null);
      });
      add("Number of active ingredients", products.map(function (r, k) { var c = Object.keys(per[k]).length; return {t: c ? String(c) : "", n: c || null}; }), null);

      sec("Difference from your product");
      var mineKeys = Object.keys(per[0]);
      var noBase = !mineKeys.length;
      var nm = function (k2) { return label[k2]; };
      add("Same as yours", products.map(function (r, k) {
        if (k === 0) return {t: "Your product"};
        if (noBase) return {t: "Your product has no supplement facts to compare. Press Read label photos on it first."};
        if (!Object.keys(per[k]).length) return {t: "Supplement facts not shown on this page"};
        var same = mineKeys.filter(function (x) { return per[k][x]; });
        return {t: same.length ? same.length + ": " + same.map(nm).join(", ") : "none"};
      }), null);
      add("Extra in this product", products.map(function (r, k) {
        if (k === 0) return {t: "Your product"};
        if (noBase) return {t: Object.keys(per[k]).map(function (x) { return nm(x) + " " + per[k][x].t; }).join(", ")};
        if (!Object.keys(per[k]).length) return {t: ""};
        var ex = Object.keys(per[k]).filter(function (x) { return !per[0][x]; });
        return {t: ex.length ? ex.length + ": " + ex.map(function (x) { return nm(x) + " " + per[k][x].t; }).join(", ") : "none"};
      }), null);
      add("Missing compared to yours", products.map(function (r, k) {
        if (k === 0) return {t: "Your product"};
        if (noBase || !Object.keys(per[k]).length) return {t: ""};
        var mi = mineKeys.filter(function (x) { return !per[k][x]; });
        return {t: mi.length ? mi.length + ": " + mi.map(nm).join(", ") : "none"};
      }), null);
    }
    sec("Other ingredients");
    add("Fillers and additives", products.map(function (r) { var o = otherIngredients(r); return {t: o ? o.length + ": " + short(o.join(", "), 140) : (r.final ? short(r.final.list.join(", "), 140) : ""), n: o ? o.length : null}; }), "low");

    var head = "<tr><th></th>" + products.map(function (r, k) {
      var link = r.url ? '<a href="' + esc2(r.url) + '" target="_blank" rel="noopener">' + esc2(short(r.title || r.asin, 70)) + "</a>" : esc2(short(r.title, 70));
      return "<th>" + (k === 0 ? '<span class="tag">Your product</span><br>' : "") + (r.image ? '<img src="' + esc2(r.image) + '" alt="">' : "") + link + "</th>";
    }).join("") + "</tr>";

    var order = products.map(function (r, k) { return k; }).sort(function (a, b) { return wins[b] - wins[a]; });
    var verdict = '<div class="verdict"><h3>Who comes out ahead on paper</h3><ol>' + order.map(function (k) {
      var r = products[k];
      return "<li><b>" + esc2(short(r.title || r.asin, 80)) + (k === 0 ? " (your product)" : "") + "</b>, best in " + wins[k] + (wins[k] === 1 ? " row" : " rows") +
        (winRows[k].length ? '<div class="why">' + esc2(winRows[k].slice(0, 8).join(", ")) + "</div>" : "") + "</li>";
    }).join("") + "</ol>" +
      '<div class="cmpcta"><p>Want to beat these competitors on Amazon? Ecommupscale can help.</p>' +
      '<a class="cta book" href="https://calendly.com/hamad-akram-amazon-ecommerce/new-meeting" target="_blank" rel="noopener">Book a consultancy meeting</a>' +
      '<a class="cta audit" href="mailto:hammad.ecomm117@gmail.com">Get a free audit</a></div>' +
      '<p class="caution">Highlighted cells are the highest amount, lowest price per serving or fewest additives in that row. More mg is not always better, so look at the form of each ingredient and the serving size too. Amounts read from label photos can contain mistakes, check them against the photo.</p></div>';

    // CSV with no dashes
    var csvRows = [["Row"].concat(products.map(function (r) { return r.title || r.asin; }))];
    var tmp = document.createElement("div"); tmp.innerHTML = "<table>" + rows.join("") + "</table>";
    tmp.querySelectorAll("tr").forEach(function (tr) {
      var cells = Array.prototype.map.call(tr.cells, function (c) { return c.textContent.replace(/^not listed$/, ""); });
      csvRows.push(cells);
    });
    csvRows.push(["Rows won"].concat(wins.map(String)));
    csvRows.push(["URL"].concat(products.map(function (r) { return r.url || ""; })));
    CMP.csv = csvRows.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");

    return '<div class="ctable"><table><thead>' + head + "</thead><tbody>" + rows.join("") + "</tbody></table></div>" + verdict;
  }

  function persist() { if (chrome.storage) chrome.storage.local.set({cmp_base: CMP.base, cmp_items: CMP.items}); }

  function drawCompare(prog) {
    var list = CMP.items.slice(1).sort(function (a, b) { return matchScore(CMP.base, b) - matchScore(CMP.base, a); });
    var products = [CMP.items[0]].concat(list);
    $("#cmpOut").innerHTML = buildTable(products) + (prog && prog.length ? '<details class="more"><summary>What was read for each product (' + prog.length + ')</summary><ul class="progress">' +
      prog.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></details>" : "");
    $("#cmpCsv").disabled = products.length < 2;
    $("#cmpOut").querySelectorAll("img").forEach(function (im) { im.addEventListener("error", function () { im.remove(); }); });
  }

  async function runCompare() {
    var base = CMP.base; if (!base) return;
    var mode = whereMode(), domain = $("#cmpMp").value, n = parseInt($("#cmpN").value, 10), useLabels = $("#cmpLabels").checked;
    $("#cmpRun").disabled = true; $("#cmpCsv").disabled = true;
    var st = function (t) { $("#cmpStatus").textContent = t; };
    var prog = [];
    CMP.items = [base];
    var addProduct = function (r, label) {
      CMP.items.push(r);
      prog.push(label + ": " + ((r.facts_table || []).length ? r.facts_table.length + " supplement facts rows, " + matchScore(base, r) + "% match" : "same main ingredient, supplement facts not shown on this page"));
      drawCompare(prog); persist();
    };
    try {
      if (useLabels && !(base.facts_table || []).length && (base.photos || []).length) { st("Reading the label of your product..."); await applyLabel(base, st); }

      var amazonList = [], webList = [], seenA = [base.asin];
      $("#cmpExtra").value.split(/\s+/).filter(Boolean).forEach(function (line) {
        var it = parseInput(line, domain);
        if (it) { if (seenA.indexOf(it.asin) < 0) { seenA.push(it.asin); amazonList.push(it); } }
        else if (/^https?:\/\//.test(line)) webList.push({url: line, manual: true});
      });

      if (mode !== "web" && $("#cmpQuery").value.trim()) {
        st("Searching " + domain + "...");
        var found = await searchTop(domain, $("#cmpQuery").value.trim(), n, seenA);
        amazonList = amazonList.concat(found.map(function (x) { return {asin: x.asin, domain: domain, rating: x.rating, reviews: x.reviews}; }));
      }
      for (var i = 0; i < amazonList.length; i++) {
        st("Reading Amazon product " + (i + 1) + " of " + amazonList.length + "...");
        var r = await fetchProduct(amazonList[i].asin, amazonList[i].domain);
        if (r.status !== "ok") { prog.push(amazonList[i].asin + ": " + r.message); continue; }
        if (!isFinite(r.rating) && isFinite(amazonList[i].rating)) r.rating = amazonList[i].rating;
        if (!isFinite(r.reviews) && isFinite(amazonList[i].reviews)) r.reviews = amazonList[i].reviews;
        if (useLabels && !(r.facts_table || []).length && (r.photos || []).length) await applyLabel(r, function (t) { st("Amazon product " + (i + 1) + ": " + t.toLowerCase()); });
        addProduct(r, short(r.title, 60));
        await sleep(800 + Math.random() * 800);
      }

      if (mode !== "amazon") {
        var results = await webSearch(webQueries(base), n * 4, st);
        prog.push("Web search found " + results.length + " shop pages" + (results.engines && results.engines.length ? " (" + results.engines.join(", ") + ")" : "") + ".");
        webList = webList.concat(results);
      }
      var got = 0, mainName = mainNutrients(base).join(" or ");
      for (var j = 0; j < webList.length; j++) {
        if (!webList[j].manual && got >= n) break;
        var h = hostOf(webList[j].url);
        st("Reading " + h + " (" + (j + 1) + " of " + webList.length + ")...");
        var w = await readWebPage(webList[j].url, useLabels, function (t) { st(h + ": " + t.toLowerCase()); }, webList[j].manual ? null : {base: base});
        if (w.status !== "ok") { prog.push(h + ": " + w.message); continue; }
        if (!webList[j].manual && !related(base, w)) { prog.push(h + ": no " + mainName + " on this page, skipped"); continue; }
        if (!webList[j].manual && !w.is_product && !w.facts_table.length) { prog.push(h + ": not a product page, skipped"); continue; }
        got++;
        addProduct(w, h);
      }
      if (mode === "web" && got === 0 && !amazonList.length && $("#cmpQuery").value.trim()) {
        st("Nothing usable on the web, checking Amazon top products instead...");
        prog.push("No shop pages with " + mainName + " could be read, so Amazon top products were added.");
        var fb = await searchTop(domain, $("#cmpQuery").value.trim(), n, seenA);
        for (var f = 0; f < fb.length; f++) {
          st("Reading Amazon product " + (f + 1) + " of " + fb.length + "...");
          var ra = await fetchProduct(fb[f].asin, domain);
          if (ra.status !== "ok") continue;
          if (!isFinite(ra.rating)) ra.rating = fb[f].rating;
          if (!isFinite(ra.reviews)) ra.reviews = fb[f].reviews;
          if (useLabels && !(ra.facts_table || []).length && (ra.photos || []).length) await applyLabel(ra, function (t) { st("Amazon product " + (f + 1) + ": " + t.toLowerCase()); });
          addProduct(ra, short(ra.title, 60));
          await sleep(800 + Math.random() * 800);
        }
      }
      drawCompare(prog);
      st(CMP.items.length > 1 ? "Done. Compared your product with " + (CMP.items.length - 1) + " products." : "No products with the same main ingredient could be read. Open the details below to see why, try Both, or add links yourself.");
    } catch (e) {
      st(e.message || String(e)); drawCompare(prog);
    }
    $("#cmpRun").disabled = false;
  }
  $("#cmpRun").onclick = runCompare;
  $("#cmpCsv").onclick = function () { if (CMP.csv) IF.download(CMP.csv, "comparison_" + new Date().toISOString().slice(0, 10) + ".csv"); };

  // ---------------------------------------------------------------- web search and reading any website
  var BLOCK_HOSTS = /(^|\.)(amazon\.[a-z.]+|wikipedia\.org|youtube\.com|reddit\.com|quora\.com|pinterest\.[a-z.]+|facebook\.com|instagram\.com|x\.com|twitter\.com|healthline\.com|webmd\.com|nih\.gov|mayoclinic\.org|medicalnewstoday\.com|examine\.com|verywellhealth\.com|clevelandclinic\.org|harvard\.edu|drugs\.com|rxlist\.com|consumerlab\.com|labdoor\.com|forbes\.com|nytimes\.com|bing\.com|duckduckgo\.com|google\.[a-z.]+|linkedin\.com|tiktok\.com)$/i;

  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }

  async function getDoc(url, cred) {
    try {
      var res = await fetch(url, {credentials: cred ? "include" : "omit", cache: "no-store"});
      if (!res.ok) return null;
      return new DOMParser().parseFromString(await res.text(), "text/html");
    } catch (e) { return null; }
  }
  function unwrap(h) {
    var m = h.match(/[?&]uddg=([^&]+)/); if (m) return decodeURIComponent(m[1]);
    m = h.match(/^\/url\?(?:.*&)?q=([^&]+)/); if (m) return decodeURIComponent(m[1]);
    m = h.match(/[?&]u=a1([^&]+)/); if (m) { try { return atob(m[1].replace(/-/g, "+").replace(/_/g, "/")); } catch (e) {} }
    return h.replace(/^\/\//, "https://");
  }
  var ENGINES = [
    {name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/?q=", sel: "a.result__a", cred: false},
    {name: "DuckDuckGo lite", url: "https://lite.duckduckgo.com/lite/?q=", sel: "a.result-link", cred: false},
    {name: "Bing", url: "https://www.bing.com/search?q=", sel: "li.b_algo h2 a", cred: true},
    {name: "Google", url: "https://www.google.com/search?num=20&q=", sel: "a:has(h3)", cred: true}
  ];
  async function webSearch(queries, want, st) {
    var seen = {}, res = [], used = [];
    for (var qi = 0; qi < queries.length; qi++) {
      for (var e = 0; e < ENGINES.length; e++) {
        if (res.length >= want) break;
        var en = ENGINES[e];
        if (st) st("Searching the web with " + en.name + "...");
        var doc = await getDoc(en.url + encodeURIComponent(queries[qi]), en.cred);
        if (!doc) continue;
        var before = res.length;
        doc.querySelectorAll(en.sel).forEach(function (a) {
          var u = unwrap(a.getAttribute("href") || "");
          if (!/^https?:/.test(u)) return;
          var h = hostOf(u);
          if (!h || BLOCK_HOSTS.test(h) || seen[h]) return;
          if (/\/(blog|blogs|news|article|articles|wiki|forum|recipes?|magazine|learn|health-hub|research)\//i.test(u)) return;
          seen[h] = 1; res.push({url: u, title: (a.textContent || "").trim()});
        });
        if (res.length > before) used.push(en.name);
      }
    }
    res.engines = used;
    return res;
  }

  // Turns a downloaded page into text lines, keeping table rows on one line.
  function toText(root) {
    var out = [];
    var BLOCK = /^(P|DIV|LI|UL|OL|H1|H2|H3|H4|H5|H6|SECTION|ARTICLE|TABLE|TBODY|THEAD|DT|DD|DL|HEADER|FOOTER|FIGURE|BLOCKQUOTE|FORM|MAIN|ASIDE|SUMMARY|DETAILS)$/;
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue); return; }
      if (n.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|IFRAME)$/.test(n.tagName)) return;
      if (n.tagName === "BR") { out.push("\n"); return; }
      if (n.tagName === "TR") {
        out.push("\n" + Array.prototype.map.call(n.children, function (c) { return c.textContent.replace(/\s+/g, " ").trim(); }).join("\t") + "\n");
        return;
      }
      var block = BLOCK.test(n.tagName);
      if (block) out.push("\n");
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block) out.push("\n");
    })(root);
    return out.join("").replace(/[ \t\u00a0]*\n[ \t\u00a0\n]*/g, "\n").replace(/[ \u00a0]{2,}/g, " ").trim();
  }

  function grabFromDoc(doc, url) {
    var heading = /supplement facts|nutrition facts|nutritional information|nutrition information|n[äa]hrwert|valeurs nutritionnelles|valori nutrizionali|informaci[oó]n nutricional|voedingswaarde/i;
    var blocks = [], seen = new Set();
    var push = function (el) { if (!el || seen.has(el)) return; seen.add(el); var t = toText(el); if (t.length > 30 && t.length < 6000) blocks.push(t); };
    var w = doc.createTreeWalker(doc.body || doc.documentElement, 4), n, hits = 0;
    while ((n = w.nextNode()) && hits < 15) {
      var p = n.parentElement;
      if (p && /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
      if (heading.test(n.nodeValue)) { hits++; for (var k = 0, el = p; k < 6 && el; k++, el = el.parentElement) push(el); }
    }
    doc.querySelectorAll("table").forEach(function (t) { if ((t.textContent.match(/\d\s?(mg|mcg|µg|iu)\b/gi) || []).length >= 3) push(t); });
    var meta = function (sel) { var e = doc.querySelector(sel); return e ? (e.getAttribute("content") || e.textContent || "").trim() : ""; };
    var info = {name: "", price: "", currency: "", images: [], rating: "", reviews: "", brand: ""};
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      try {
        var data = JSON.parse(s.textContent), list = [].concat(data["@graph"] || data);
        list.forEach(function (d) {
          if (!d || !/product/i.test([].concat(d["@type"]).join(" "))) return;
          info.name = info.name || d.name || "";
          info.images = info.images.concat([].concat(d.image || []).map(function (x) { return typeof x === "string" ? x : (x && x.url) || ""; }));
          info.brand = info.brand || (d.brand && (d.brand.name || d.brand)) || "";
          var o = [].concat(d.offers || [])[0];
          if (o) { if (o.offers) o = [].concat(o.offers)[0] || o; info.price = info.price || String(o.price || o.lowPrice || ""); info.currency = info.currency || o.priceCurrency || ""; }
          if (d.aggregateRating) { info.rating = info.rating || String(d.aggregateRating.ratingValue || ""); info.reviews = info.reviews || String(d.aggregateRating.reviewCount || d.aggregateRating.ratingCount || ""); }
        });
      } catch (e) {}
    });
    var abs = function (u) { try { return new URL(u.replace(/^\/\//, "https://"), url).href; } catch (e) { return ""; } };
    var imgs = info.images.concat([meta('meta[property="og:image"]')]);
    doc.querySelectorAll("img").forEach(function (im) {
      var u = im.getAttribute("data-src") || im.getAttribute("data-zoom") || im.getAttribute("data-large_image") || im.getAttribute("src") || "";
      var ss = im.getAttribute("srcset") || im.getAttribute("data-srcset") || "";
      if (ss) { var parts = ss.split(",").map(function (x) { return x.trim().split(/\s+/)[0]; }); u = parts[parts.length - 1] || u; }
      var hint = (u + " " + (im.getAttribute("alt") || "")).toLowerCase();
      if (/fact|label|nutri|supplement|back|ingredient|panel/.test(hint)) imgs.unshift(u); else imgs.push(u);
    });
    imgs = imgs.map(abs).filter(function (u, i, a) { return /^https:/.test(u) && !/\.svg|logo|icon|sprite|badge|payment|flag/i.test(u) && a.indexOf(u) === i; });
    var bodyTxt = (doc.body ? doc.body.textContent : "").slice(0, 200000);
    var isProduct = !!info.name || /product/i.test(meta('meta[property="og:type"]')) || !!meta('meta[property="product:price:amount"]') ||
      /add to (cart|bag|basket)|buy now|in den warenkorb|ajouter au panier|aggiungi al carrello|añadir a la cesta|añadir al carrito|in winkelwagen|subscribe (&|and) save/i.test(bodyTxt);
    return {isProduct: isProduct, url: url, host: hostOf(url), title: info.name || meta('meta[property="og:title"]') || meta("h1") || meta("title"),
      price: ((info.currency || meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]')) + " " +
        (info.price || meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || meta('[itemprop="price"]'))).trim(),
      image: imgs[0] || "", images: imgs.slice(0, 12), rating: info.rating, reviews: info.reviews, brand: typeof info.brand === "string" ? info.brand : "",
      blocks: blocks.slice(0, 40), body: toText(doc.body || doc.documentElement).slice(0, 80000)};
  }

  async function readWebPage(url, useLabels, st, opts) {
    var res;
    try { res = await fetch(url, {credentials: "include", cache: "no-store"}); } catch (e) { return {status: "error", url: url, message: "Could not open this page."}; }
    if (!res.ok) return {status: "error", url: url, message: "The page answered with error " + res.status + "."};
    var raw = await res.text();
    var src = grabFromDoc(new DOMParser().parseFromString(raw, "text/html"), res.url || url);
    var r = fromPage(src);
    r.page_text = (src.title || "") + " " + (src.body || "").slice(0, 3000);
    if (opts && opts.base && !related(opts.base, r)) return r;
    if (useLabels && !r.facts_table.length && r.images && r.images.length) {
      r.photos = [r.images[0]].concat(r.images.slice(0, 4));
      await applyLabel(r, st || function () {});
    }
    return r;
  }

  function factKeys(r) {
    return (r.facts_table || []).map(function (row) { return nameKey(row[0] || ""); }).filter(Boolean);
  }
  function words(t) { return String(t || "").toLowerCase().replace(/[^a-zà-ÿ0-9 ]+/g, " ").split(/\s+/).filter(function (w) { return w.length > 3; }); }
  // How close a product is to your product: shared supplement facts first, title words when there are no facts.
  function matchScore(base, r) {
    var STOP = /^(vitamin|vit|extract|powder|complex|blend|proprietary|acid|root|leaf|seed|total|from|with|and|other|form|forms|mineral|minerals|elemental|providing)$/;
    var tokens = function (keys) {
      var s = {};
      keys.forEach(function (k) {
        k = k.replace(/\bvitamin\s+([a-z]\d*)/g, "vit$1");
        k.split(" ").forEach(function (w) { if ((w.length > 3 || /^vit/.test(w)) && !STOP.test(w)) s[w] = 1; });
      });
      return s;
    };
    var a = factKeys(base), b = factKeys(r);
    if (a.length && b.length) {
      var ta = tokens(a), tb = tokens(b), na = Object.keys(ta).length, nb = Object.keys(tb).length;
      var inter = Object.keys(ta).filter(function (w) { return tb[w]; }).length;
      var uni = Object.keys(Object.assign({}, ta, tb)).length;
      if (!na || !nb) return 0;
      return Math.round((0.7 * inter / Math.min(na, nb) + 0.3 * inter / uni) * 100);
    }
    var wa = words(base.title), wb = words(r.title), hit = wa.filter(function (w) { return wb.indexOf(w) >= 0; }).length;
    return wa.length ? Math.round(hit / wa.length * 60) : 0;
  }

  var FORM_RE = /\b(bisglycinate|glycinate|citrate|oxide|malate|taurate|orotate|threonate|l\s?threonate|picolinate|gluconate|carbonate|sulfate|sulphate|aspartate|lactate|chloride|chelate|amino acid chelate|ascorbate|methylcobalamin|cyanocobalamin|cholecalciferol|ergocalciferol|menaquinone|mk\s?7|mk\s?4|methylfolate|folic acid|pyridoxal|pyridoxine|hydrochloride|monohydrate|orotate|fumarate|succinate|bisglycinate chelate)\b/gi;
  var STOPW = /^(vitamin|vit|extract|powder|complex|blend|proprietary|acid|root|leaf|seed|total|from|with|and|other|form|forms|mineral|minerals|elemental|providing|supplement|capsule|capsules|tablet|tablets|gummy|gummies)$/;

  // The main nutrient of your product, for example "magnesium".
  function mainNutrients(base) {
    var pst = ((base.key_fields || {})["Primary supplement type"] || "").toLowerCase();
    var out = pst.split(/[,/&]+/).map(function (x) { return x.replace(FORM_RE, "").replace(/[^a-zà-ÿ0-9 ]+/g, " ").trim(); }).filter(Boolean)
      .map(function (x) { return x.replace(/^vitamin\s+/, "vit"); });
    if (out.length) return out.map(function (x) { return x.split(" ").filter(function (w) { return !STOPW.test(w); }).join(" ") || x; });
    var count = {};
    factKeys(base).forEach(function (k) {
      k.replace(/\bvitamin\s+([a-z]\d*)/g, "vit$1").replace(FORM_RE, " ").split(" ").forEach(function (w) {
        if ((w.length > 3 || /^vit/.test(w)) && !STOPW.test(w)) count[w] = (count[w] || 0) + 1;
      });
    });
    var top = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
    if (top.length) return [top[0]];
    var MARKETING = /^(organic|premium|natural|pure|extra|strength|full|spectrum|high|potency|best|advanced|ultra|super|max|maximum|clinical|vegan|gluten|free|made|daily|formula|support|supplement|supplements|capsules?|tablets?|gummies|count|serving|servings|root|extract|powder|with|black|pepper)$/;
    var w = words(guessQuery(base)).filter(function (x) { return !MARKETING.test(x); });
    return w.slice(0, 1);
  }
  function related(base, r) {
    var main = mainNutrients(base);
    var hay = (factKeys(r).join(" ") + " " + (r.title || "") + " " + (r.final ? r.final.text : "") + " " + (r.page_text || "")).toLowerCase().replace(/\bvitamin\s+([a-z]\d*)/g, "vit$1");
    return main.some(function (m) { return m && hay.indexOf(m) >= 0; });
  }
  function formsOf(r) {
    var txt = (r.facts_table || []).map(function (x) { return x[0]; }).join(" ") + " " + (r.final ? r.final.text : "");
    var f = (txt.match(FORM_RE) || []).map(function (x) { return x.toLowerCase().replace(/\s+/g, " "); });
    f = f.filter(function (x, i) { return f.indexOf(x) === i; });
    return f.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); });
  }

  // ---------------------------------------------------------------- product from any website
  function fromPage(src) {
    var best = null;
    (src.blocks || []).forEach(function (b) {
      var p = IFOCR.parse(b);
      if (!best || p.rows.length > best.rows.length || (p.rows.length === best.rows.length && b.length < best.len)) { best = p; best.len = b.length; }
    });
    var bodyP = IFOCR.parse(src.body || "");
    var ing = (best && best.ingredients) || bodyP.ingredients;
    var serving = (best && best.serving) || bodyP.serving;
    var rows = best && best.rows.length ? best.rows : [];
    var spc = ((src.blocks || []).join("\n") + "\n" + (src.body || "")).match(/servings?\s+per\s+(?:container|bottle|pack)\s*[:：]?\s*(\d+)/i);
    return {asin: "", domain: "", marketplace: "", url: src.url, status: "ok", message: "", source_site: src.host,
      title: src.title || src.host, brand: src.brand || "", image: /^https:/.test(src.image || "") ? src.image : "",
      price: /\d/.test(src.price || "") ? src.price : "", rating: num(src.rating), reviews: countNum(src.reviews),
      final: ing ? {text: ing, list: IF.splitIngredients(ing), source: "Page text", confidence: "Medium"} : null,
      candidates: [], photos: [], facts_table: rows, facts_text: [serving, spc ? "Servings per container: " + spc[1] : ""].filter(Boolean), directions: [], safety: [], other_info: [],
      key_fields: {}, details: [], bullets: [], is_product: src.isProduct !== false, images: src.images || (src.image ? [src.image] : []),
      label_note: rows.length ? "" : "No supplement facts table was found as text on this page. If the facts are only in a picture, use the Ingredient Finder HTML tool to read that picture."};
  }

  if (new URLSearchParams(location.search).get("src") === "page" && chrome.storage && chrome.storage.session) {
    Promise.all([chrome.storage.session.get("ext_source"), chrome.storage.local.get(["cmp_base", "cmp_items"])]).then(async function (o) {
      var src = o[0] && o[0].ext_source; if (!src) return;
      var r = fromPage(src);
      var saved = o[1] || {};
      if (saved.cmp_base && saved.cmp_items && saved.cmp_items.length) {
        // add this page to the comparison of your Amazon product
        CMP.base = saved.cmp_base; CMP.items = saved.cmp_items.filter(function (x) { return x.url !== r.url; });
        $("#cmp").hidden = false;
        $("#cmpFor").textContent = "Your product: " + (CMP.base.title || CMP.base.asin);
        $("#cmpQuery").value = guessQuery(CMP.base); $("#cmpWebQuery").value = webQuery(CMP.base); $("#cmpMp").value = CMP.base.domain || "amazon.com";
        if (!r.facts_table.length && r.images.length && $("#cmpLabels").checked) {
          r.photos = [r.images[0]].concat(r.images.slice(0, 6));
          await applyLabel(r, function (t) { $("#cmpStatus").textContent = r.source_site + ": " + t.toLowerCase(); });
        }
        CMP.items.push(r); persist(); drawCompare([]);
        $("#cmpStatus").textContent = "Added " + r.source_site + " to the comparison" + (r.facts_table.length ? "." : ", but no supplement facts were found on that page.");
        RESULTS = [r]; SLOTS = [document.createElement("div")];
        $("#results").innerHTML = ""; $("#results").appendChild(SLOTS[0]); render(0); summary();
      } else {
        RESULTS = [r]; SLOTS = [document.createElement("div")];
        $("#results").innerHTML = ""; $("#results").appendChild(SLOTS[0]);
        render(0); summary(); openCompare(r);
      }
    });
  }

  // Ecommupscale free audit email, filled with the product you are looking at
  function auditLink() {
    var r = (CMP.base) || RESULTS.find(function (x) { return x && x.status === "ok"; });
    var body = "Hi Hammad,\n\nI would like a free Amazon audit for my brand.\n\n" +
      "Brand or store name: \nMarketplace: " + (r && r.domain ? r.domain : "") + "\nProduct: " + (r ? (r.title || "") : "") +
      "\nASIN or link: " + (r ? (r.asin ? r.asin + " " : "") + (r.url || "") : "") + "\n\nThanks";
    return "mailto:hammad.ecomm117@gmail.com?subject=" + encodeURIComponent("Free Amazon audit request") + "&body=" + encodeURIComponent(body);
  }
  ["#auditBtn", "#auditBtn2"].forEach(function (id) { var el = $(id); if (el) el.addEventListener("click", function () { el.href = auditLink(); }); });
  document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a.cta.audit"); if (a) a.href = auditLink(); }, true);

  // ---------------------------------------------------------------- find Amazon products by ingredients
  // BEGIN_FIND
  var FIND = {items: [], skipped: [], list: [], csv: "", stop: false, running: false};
  var ALIAS = {
    vitd3: ["vitd3", "cholecalciferol"], vitd: ["vitd", "vitd2", "vitd3", "cholecalciferol", "ergocalciferol"],
    cholecalciferol: ["cholecalciferol", "vitd3"], vitb6: ["vitb6", "pyridoxine", "pyridoxal", "p5p"], pyridoxine: ["pyridoxine", "vitb6"],
    vitb12: ["vitb12", "cobalamin", "methylcobalamin", "cyanocobalamin", "adenosylcobalamin"], cobalamin: ["cobalamin", "vitb12"],
    vitb9: ["vitb9", "folate", "folic", "methylfolate"], folate: ["folate", "vitb9", "folic", "methylfolate"], folic: ["folic", "folate", "vitb9"],
    vitb1: ["vitb1", "thiamine", "thiamin"], thiamine: ["thiamine", "thiamin", "vitb1"], vitb2: ["vitb2", "riboflavin"], riboflavin: ["riboflavin", "vitb2"],
    vitb3: ["vitb3", "niacin", "niacinamide"], niacin: ["niacin", "vitb3", "niacinamide"], vitb5: ["vitb5", "pantothenic", "pantothenate"],
    vitb7: ["vitb7", "biotin"], biotin: ["biotin", "vitb7"], vitc: ["vitc", "ascorbic", "ascorbate"], ascorbic: ["ascorbic", "vitc", "ascorbate"],
    vite: ["vite", "tocopherol", "tocopheryl", "tocotrienol"], tocopherol: ["tocopherol", "vite", "tocopheryl"],
    vitk2: ["vitk2", "menaquinone", "mk7", "mk4"], menaquinone: ["menaquinone", "vitk2", "mk7"], vitk: ["vitk", "vitk1", "vitk2", "phylloquinone", "menaquinone"],
    vita: ["vita", "retinol", "retinyl", "betacarotene"], coq10: ["coq10", "coenzyme", "ubiquinone", "ubiquinol"], coenzyme: ["coenzyme", "coq10"], q10: ["q10", "coq10"],
    ashwagandha: ["ashwagandha", "withania"], turmeric: ["turmeric", "curcumin", "curcuminoids"], curcumin: ["curcumin", "turmeric", "curcuminoids"]
  };
  var FORMALT = {bisglycinate: ["bisglycinate", "glycinate"], hcl: ["hcl", "hydrochloride"], hydrochloride: ["hydrochloride", "hcl"],
    sulphate: ["sulphate", "sulfate"], sulfate: ["sulfate", "sulphate"], chelated: ["chelate"], chelate: ["chelate"]};
  var STOPTOK = /^(as|from|of|the|and|with|mg|mcg|iu|ug|extract|powder|complex|acid|supplement|supplements|capsule|capsules|tablet|tablets|gummy|gummies|softgel|softgels|vitamin|vitamins|mineral|minerals|elemental|total|pure|organic|natural|high|strength|per|serving|servings|root|leaf|standardized|blend)$/;
  var FORMTOK = /^(bisglycinate|glycinate|citrate|oxide|malate|taurate|orotate|threonate|picolinate|gluconate|carbonate|sulfate|sulphate|aspartate|lactate|chloride|chelate|chelated|ascorbate|methylcobalamin|cyanocobalamin|adenosylcobalamin|methylfolate|hydrochloride|hcl|monohydrate|fumarate|succinate|liposomal|ubiquinol|ubiquinone)$/;

  // Lower case, turns "Vitamin B 12", "B12", "Vit D3", "D3" into vitb12, vitd3 and so on, and pads with spaces.
  function normI(t) {
    var s = String(t || "").toLowerCase();
    s = s.replace(/\bvit(?:amin)?s?\.?\s*([a-ek])[\s\-]?(\d{1,2})?(?![a-z0-9])/g, function (m, l, d) { return "vit" + l + (d || ""); });
    s = s.replace(/(^|[^a-z0-9])b[\s\-]?(12|1|2|3|5|6|7|9)(?![a-z0-9])/g, "$1vitb$2");
    s = s.replace(/(^|[^a-z0-9])([dk])[\s\-]?([123])(?![a-z0-9])/g, "$1vit$2$3");
    s = s.replace(/(^|[^a-z0-9])mk[\s\-]?([47])(?![a-z0-9])/g, "$1mk$2");
    return " " + s.replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }
  function parseIngList(text) {
    var out = [], seen = {};
    String(text || "").split(/\n+/).forEach(function (line) {
      IF.splitIngredients(line.replace(/\s+[+&]\s+/g, ", ")).forEach(function (item) {
        var m = item.match(/(\d[\d.,]*)\s*(mg|mcg|µg|μg|ug|g|iu|cfu|billion cfu)\b/i);
        var name = item.replace(m ? m[0] : "", " ").replace(/\(\s*\)/g, " ").replace(/^[\s•*·\-–—]+/, "").replace(/\s+/g, " ").replace(/[\s,;:]+$/, "").trim();
        var toks = normI(name).split(" ").filter(function (w) { return w && !/^\d+$/.test(w) && (w.length > 1) && !STOPTOK.test(w); });
        var forms = toks.filter(function (w) { return FORMTOK.test(w); }), nut = toks.filter(function (w) { return !FORMTOK.test(w); });
        if (!nut.length) { nut = forms; forms = []; }
        if (!nut.length) return;
        var key = nut.join(" ") + "|" + forms.join(" ");
        if (seen[key]) return; seen[key] = 1;
        out.push({name: name || item, amount: m ? m[0] : "", nut: nut, forms: forms});
      });
    });
    return out;
  }
  function hasNut(hay, ing) { return ing.nut.every(function (t) { return (ALIAS[t] || [t]).some(function (a) { return hay.indexOf(" " + a) >= 0; }); }); }
  function hasForm(hay, ing) { return ing.forms.every(function (f) { return (FORMALT[f] || [f]).some(function (a) { return hay.indexOf(a) >= 0; }); }); }
  var UNITF = {mg: 1, mcg: 1000, "µg": 1000, "μg": 1000, ug: 1000, g: 0.001};

  function analyse(r, ings, needForm) {
    var ft = r.facts_table || [];
    var factsH = normI(ft.map(function (x) { return x.join(" "); }).join(" "));
    var ingrH = normI(r.final ? r.final.text : "");
    var listH = normI([r.title].concat(r.bullets || [], (r.details || []).map(function (d) { return d.value; }), Object.keys(r.key_fields || {}).map(function (k) { return r.key_fields[k]; })).join(" "));
    var allH = factsH + ingrH + listH;
    var rows = ings.map(function (ing) {
      var st = {ing: ing, status: "none", amount: "", delta: ""};
      var lvl = hasNut(factsH, ing) ? "facts" : hasNut(ingrH, ing) ? "ingredients" : hasNut(listH, ing) ? "listing" : "";
      if (!lvl) return st;
      if (needForm && ing.forms.length && !hasForm(allH, ing)) { st.status = "form"; return st; }
      st.status = lvl;
      if (lvl === "facts") {
        var row = ft.find(function (x) { return hasNut(normI(x[0]), ing) && (!needForm || !ing.forms.length || hasForm(normI(x.join(" ")), ing)); }) ||
          ft.find(function (x) { return hasNut(normI(x[0]), ing); });
        if (row) {
          var cellTxt = row.slice(1).join(" "), am = cellTxt.match(/[\d.,]+\s*(mg|mcg|µg|μg|ug|g|iu|cfu|billion cfu|kcal)(?![a-z])/i);
          if (am) {
            st.amount = am[0].replace(/\s+/g, " ");
            var pa = toMg(am[0]), ua = toMg(ing.amount);
            if (pa && ua && pa.u === ua.u) {
              var diff = pa.v - ua.v, uni = (am[1] || "").toLowerCase(), f = UNITF[uni] || 1;
              st.delta = Math.abs(diff) < 0.0005 ? "same as yours" : fmt(Math.abs(diff) * f) + " " + am[1] + (diff > 0 ? " more" : " less") + " than yours";
            }
          }
        }
      }
      return st;
    });
    var w = {facts: 1, ingredients: 1, listing: 0.7, form: 0.4, none: 0};
    var score = rows.reduce(function (a, x) { return a + w[x.status]; }, 0) / (ings.length || 1);
    var all = rows.every(function (x) { return x.status === "facts" || x.status === "ingredients" || x.status === "listing"; });
    var confirmed = rows.filter(function (x) { return x.status === "facts" || x.status === "ingredients"; }).length;
    var extras = [], seenE = {};
    ft.forEach(function (row) {
      var nm = row[0] || "", key = nameKey(nm);
      if (!key || seenE[key] || /^(serving|servings|amount|calories|energy|total|daily|percent)/.test(key) || !toMg(row.slice(1).join(" "))) return;
      var n = normI(nm);
      if (ings.some(function (g) { return hasNut(n, g); })) return;
      seenE[key] = 1; extras.push(nm.replace(/\s+/g, " ").trim());
    });
    return {rows: rows, score: score, all: all, confirmed: confirmed, extras: extras};
  }

  async function amazonPage(domain, query, page) {
    var res = await fetch("https://www." + domain + "/s?k=" + encodeURIComponent(query) + (page > 1 ? "&page=" + page : ""), {credentials: "include", cache: "no-store"});
    var raw = await res.text(), doc = new DOMParser().parseFromString(raw, "text/html"), items = [];
    doc.querySelectorAll('div[data-component-type="s-search-result"][data-asin]').forEach(function (el) {
      var asin = el.getAttribute("data-asin"); if (!asin) return;
      var h2 = el.querySelector("h2"), ra = el.querySelector("span.a-icon-alt");
      var rv = el.querySelector('a[href*="customerReviews"] span, span[aria-label$="ratings"], span[aria-label$="Bewertungen"], span.s-underline-text');
      items.push({asin: asin, title: h2 ? h2.textContent.trim() : "",
        rating: num(((ra ? ra.textContent : "").match(/[\d.,]+/) || [])[0]),
        reviews: rv ? countNum(rv.getAttribute("aria-label") || rv.textContent) : NaN});
    });
    if (!items.length && /validatecaptcha|enter the characters you see below/i.test(raw)) throw new Error("Amazon showed a robot check on the search. Open " + domain + " in a normal tab, solve it once, and try again.");
    return items;
  }

  function findCell(x) {
    var s = x.status, nm = x.ing.nut.join(" ");
    if (s === "facts") return {cls: "ok", t: x.amount || "Found in supplement facts", sub: x.delta};
    if (s === "ingredients") return {cls: "ok", t: "Found in ingredient list", sub: "amount not shown"};
    if (s === "listing") return {cls: "weak", t: "Mentioned in title or description only", sub: "not confirmed on the label"};
    if (s === "form") return {cls: "weak", t: "Has " + nm + ", but a different form", sub: ""};
    return {cls: "miss", t: "Missing", sub: ""};
  }

  function drawFind() {
    var ings = FIND.list, items = FIND.items.slice().sort(function (a, b) {
      var q = function (x) { return (x.r.rating || 0) * Math.log10((x.r.reviews || 0) + 1); };
      return b.a.score - a.a.score || a.a.extras.length - b.a.extras.length || q(b) - q(a);
    });
    var cur = function (r) { return ((r.price || "").match(/[^\d\s.,]+/) || [""])[0]; };
    var head = "<tr><th>Product</th><th>Match</th>" + ings.map(function (g) { return "<th>" + esc(g.name) + (g.amount ? '<span class="sub">Yours: ' + esc(g.amount) + "</span>" : "") + "</th>"; }).join("") +
      "<th>Extra ingredients</th><th>Price</th><th>Price per serving</th><th>Rating</th><th>Reviews</th><th></th></tr>";
    var csv = [["Rank", "Product", "ASIN", "Marketplace", "Link", "Match percent", "Price", "Price per serving", "Rating", "Reviews"].concat(ings.map(function (g) { return g.name; }), ["Extra ingredients"])];
    var body = items.map(function (x, i) {
      var r = x.r, a = x.a, p = num(r.price), s = servings(r), pps = p && s ? p / s : NaN, pct = Math.round(a.score * 100);
      var cells = a.rows.map(findCell);
      var link = '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(short(r.title || r.asin, 90)) + "</a>";
      csv.push([i + 1, r.title || "", r.asin, r.domain, r.url, pct + "%", r.price || "", isFinite(pps) ? cur(r) + fmt(pps) : "",
        isFinite(r.rating) ? r.rating : "", isFinite(r.reviews) ? r.reviews : ""]
        .concat(cells.map(function (c) { return c.t + (c.sub ? " (" + c.sub + ")" : ""); }), [a.extras.join(", ")]));
      return "<tr><td>" + (r.image ? '<img src="' + esc(r.image) + '" alt="">' : "") + link + '<span class="sub">' + esc(r.asin) + "</span></td>" +
        '<td><span class="pm">' + pct + "%</span><span class=\"sub\">" + a.rows.filter(function (z) { return z.status !== "none" && z.status !== "form"; }).length + " of " + ings.length + " ingredients</span></td>" +
        cells.map(function (c) { return '<td class="' + c.cls + '">' + esc(c.t) + (c.sub ? '<span class="sub">' + esc(c.sub) + "</span>" : "") + "</td>"; }).join("") +
        "<td>" + (a.extras.length ? "<b>" + a.extras.length + "</b>: " + esc(short(a.extras.join(", "), 120)) : "none shown") + "</td>" +
        "<td>" + esc(r.price || "not listed") + "</td><td>" + (isFinite(pps) ? esc(cur(r) + fmt(pps)) : "not listed") + "</td>" +
        "<td>" + (isFinite(r.rating) ? r.rating + " of 5" : "not listed") + "</td><td>" + (isFinite(r.reviews) ? Number(r.reviews).toLocaleString() : "not listed") + "</td>" +
        '<td><button type="button" data-open="' + esc(r.asin) + '" data-dom="' + esc(r.domain) + '">Read full details</button></td></tr>';
    }).join("");
    FIND.csv = csv.map(function (row) { return row.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
    $("#ingCsv").disabled = !items.length;
    $("#findOut").innerHTML = (items.length ? '<div class="ctable ftable"><table><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      '<p class="caution">Match is the share of your ingredients found in the product. Green means it was found in the supplement facts or ingredient list. Orange means it is only mentioned in the title or description, or the form is different, so check the label. Amounts read from label photos can contain mistakes.</p>' +
      '<div class="cmpcta"><p>Want to beat these competitors on Amazon? Ecommupscale can help.</p><a class="cta book" href="https://calendly.com/hamad-akram-amazon-ecommerce/new-meeting" target="_blank" rel="noopener">Book a consultancy meeting</a><a class="cta audit" href="mailto:hammad.ecomm117@gmail.com">Get a free audit</a></div>' : "") +
      (FIND.skipped.length ? '<details class="more"><summary>What was skipped (' + FIND.skipped.length + ')</summary><ul class="progress">' + FIND.skipped.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></details>" : "");
    $("#findOut").querySelectorAll("img").forEach(function (im) { im.addEventListener("error", function () { im.remove(); }); });
  }

  async function runFind(e) {
    if (e) e.preventDefault();
    if (FIND.running) return;
    var ings = parseIngList($("#ingList").value), msg = $("#ingMsg");
    msg.textContent = "";
    if (!ings.length) { msg.textContent = "Add at least one ingredient."; return; }
    var domain = $("#ingMp").value, n = parseInt($("#ingN").value, 10), onlyAll = $("#ingAll").checked, needForm = $("#ingSameForm").checked, useLabels = $("#ingLabels").checked;
    if (chrome.storage) chrome.storage.local.set({ing_last: $("#ingList").value, ing_mp: domain});
    FIND = {items: [], skipped: [], list: ings, csv: "", stop: false, running: true};
    $("#find").hidden = false; $("#findOut").innerHTML = "";
    $("#findFor").textContent = "Looking for: " + ings.map(function (g) { return g.name + (g.amount ? " " + g.amount : ""); }).join(", ");
    $("#ingRun").disabled = true; $("#ingCsv").disabled = true; $("#ingStop").hidden = false;
    var st = function (t) { $("#findStatus").textContent = t; };
    var names = ings.map(function (g) { return g.name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(); }).filter(Boolean);
    var queries = [names.slice(0, 4).join(" ") + " supplement"];
    if (names.length > 2) queries.push(names.slice(0, 2).join(" ") + " supplement");
    if (names.length > 1) queries.push(names[0] + " supplement");
    queries = queries.filter(function (q, i, arr) { return arr.indexOf(q) === i; });
    try {
      var cap = Math.min(40, Math.max(n * 4, 24)), pool = [], seen = {}, i;
      for (var qi = 0; qi < queries.length && pool.length < cap && !FIND.stop; qi++) {
        for (var pg = 1; pg <= 2 && pool.length < cap && !FIND.stop; pg++) {
          st("Searching " + domain + " for " + queries[qi] + " (page " + pg + ")...");
          var found = await amazonPage(domain, queries[qi], pg);
          found.forEach(function (x) { if (!seen[x.asin]) { seen[x.asin] = 1; pool.push(x); } });
          if (!found.length) break;
          await sleep(600 + Math.random() * 600);
        }
      }
      if (!pool.length) throw new Error("No products came back from Amazon for these ingredients. Try fewer or simpler ingredient names.");
      var hits = function (x) { var h = normI(x.title); return ings.filter(function (g) { return hasNut(h, g); }).length; };
      pool = pool.map(function (x, k) { return {x: x, k: k, h: hits(x)}; }).sort(function (a, b) { return b.h - a.h || a.k - b.k; }).map(function (z) { return z.x; });
      var maxRead = Math.min(pool.length, cap), needAmt = ings.some(function (g) { return g.amount; }), robot = 0, read = 0;
      for (i = 0; i < maxRead && !FIND.stop && FIND.items.length < n; i++) {
        var c = pool[i];
        st("Reading product " + (i + 1) + " of " + maxRead + ". Found " + FIND.items.length + " with your ingredients so far.");
        var r = await fetchProduct(c.asin, domain);
        if (r.status !== "ok") {
          FIND.skipped.push(c.asin + ": " + r.message);
          if (r.status === "blocked" && ++robot >= 2) throw new Error("Amazon keeps showing a robot check. Open " + domain + " in a normal tab, solve it once, and press Find products again.");
          continue;
        }
        read++;
        if (!isFinite(r.rating) && isFinite(c.rating)) r.rating = c.rating;
        if (!isFinite(r.reviews) && isFinite(c.reviews)) r.reviews = c.reviews;
        var a = analyse(r, ings, needForm);
        var needsOcr = useLabels && !(r.facts_table || []).length && (r.photos || []).length && (a.score > 0 ? (needAmt || a.confirmed < ings.length) : !r.final);
        if (needsOcr) {
          await applyLabel(r, function (t) { st("Product " + (i + 1) + ": " + t.toLowerCase()); });
          a = analyse(r, ings, needForm);
        }
        var ok = onlyAll ? a.all : a.score > 0;
        if (ok) { FIND.items.push({r: r, a: a}); drawFind(); }
        else FIND.skipped.push(short(r.title || r.asin, 70) + ": " + (a.score > 0 ? "only some of your ingredients" : "none of your ingredients") + ", skipped");
        await sleep(800 + Math.random() * 800);
      }
      drawFind();
      st((FIND.stop ? "Stopped. " : "Done. ") + "Read " + read + " Amazon products and " + FIND.items.length + " contain your ingredients." +
        (FIND.items.length ? "" : " Try unchecking Only products that contain all my ingredients, or Same form too."));
    } catch (err) {
      st(err.message || String(err)); drawFind();
    }
    FIND.running = false; $("#ingRun").disabled = false; $("#ingStop").hidden = true;
  }

  function setTab(t) {
    var ing = t === "ing";
    $("#form").hidden = ing; $("#ingForm").hidden = !ing; $("#asinMain").hidden = ing; $("#find").hidden = !ing || (!FIND.list.length);
    $("#tabAsin").classList.toggle("on", !ing); $("#tabIng").classList.toggle("on", ing);
    $("#tabAsin").setAttribute("aria-selected", String(!ing)); $("#tabIng").setAttribute("aria-selected", String(ing));
  }
  $("#ingMp").innerHTML = Object.keys(IF.MP).map(function (d) { return '<option value="' + d + '">' + IF.MP[d] + ", " + d + "</option>"; }).join("");
  $("#tabAsin").onclick = function () { setTab("asin"); };
  $("#tabIng").onclick = function () { setTab("ing"); };
  $("#ingForm").addEventListener("submit", runFind);
  $("#ingStop").onclick = function () { FIND.stop = true; $("#findStatus").textContent = "Stopping after this product..."; };
  $("#ingCsv").onclick = function () { if (FIND.csv) IF.download(FIND.csv, "products_with_ingredients_" + new Date().toISOString().slice(0, 10) + ".csv"); };
  $("#findOut").addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button[data-open]"); if (!b) return;
    $("#mp").value = b.getAttribute("data-dom"); $("#asins").value = b.getAttribute("data-open");
    setTab("asin"); run();
  });
  if (chrome.storage) chrome.storage.local.get(["ing_last", "ing_mp"]).then(function (o) {
    if (o && o.ing_last && !$("#ingList").value) $("#ingList").value = o.ing_last;
    $("#ingMp").value = (o && o.ing_mp) || "amazon.com";
  }); else $("#ingMp").value = "amazon.com";
  if (new URLSearchParams(location.search).get("tab") === "ing") setTab("ing");
  // END_FIND

  $("#form").addEventListener("submit", run);
  $("#csv").onclick = function () {
    var rows = RESULTS.filter(Boolean);
    if (!rows.length) { $("#formmsg").textContent = "Run a search first, then download the CSV."; return; }
    IF.download(IF.csv(rows), "ingredients_" + new Date().toISOString().slice(0, 10) + ".csv");
  };

  var pre = new URLSearchParams(location.search).get("u");
  if (pre) { $("#asins").value = pre; run(); }
})();
