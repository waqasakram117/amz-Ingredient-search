var IF = (function () {
  var MP = {"amazon.com":"US","amazon.ca":"CA","amazon.com.mx":"MX","amazon.com.br":"BR","amazon.co.uk":"UK","amazon.de":"DE","amazon.fr":"FR","amazon.it":"IT","amazon.es":"ES","amazon.nl":"NL","amazon.com.be":"BE","amazon.se":"SE","amazon.pl":"PL","amazon.com.tr":"TR","amazon.ae":"AE","amazon.sa":"SA","amazon.eg":"EG","amazon.in":"IN","amazon.co.jp":"JP","amazon.com.au":"AU","amazon.sg":"SG"};
  var clean = function (t) { return String(t == null ? "" : t).replace(/[\u200e\u200f]/g, "").replace(/\s+/g, " ").trim(); };
  var trimP = function (t) { return clean(t).replace(/^[\s:：.]+|[\s:：]+$/g, ""); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); };
  function textOf(el) {
    if (!el) return "";
    var parts = [], w = (el.ownerDocument || document).createTreeWalker(el, 4), n;
    while ((n = w.nextNode())) {
      var p = n.parentElement;
      if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
      var t = n.nodeValue.trim();
      if (t) parts.push(t);
    }
    return clean(parts.join(" "));
  }

  var ING_WORDS = ["ingredient","ingrédient","ingrediënt","ingredienser","zutaten","inhaltsstoffe","składniki","içindekiler","المكونات","مكونات","原材料","成分","inci"];
  var LABEL_G = /(?<![A-Za-zÀ-ÿ])((?:active|inactive|other|key|main)\s+)?(ingredients?|ingrédients?|ingredienti|ingredientes|ingrediënten|ingredienser|zutaten|inhaltsstoffe|składniki|içindekiler)\s*[:：]\s*/gi;
  var LABEL_1 = new RegExp(LABEL_G.source, "i");
  var STOP_RE = /(?:^|\s)(?:directions?(?: for use)?|how to use|suggested use|recommended use|usage|warnings?|caution|precautions?|storage|allergens?|allergene|allergènes|allergeni|alérgenos|allergy advice|net wt|anwendung|verwendung|warnhinweise?|hinweise?|mode d'emploi|utilisation|précautions?|avertissements?|modo d'uso|avvertenze|modo de empleo|modo de uso|advertencias|precauciones|gebruik|waarschuwing(?:en)?|användning|varning|sposób użycia|ostrzeżenia|kullanım|uyarı(?:lar)?)\s*[:：]/i;
  var FACTS_G = /(?<![A-Za-z])(supplement facts|nutrition facts|nährwerte|valeurs nutritionnelles|valori nutrizionali|información nutricional)\s*[:：]?\s*/gi;
  var DIRECTION_WORDS = ["direction","how to use","suggested use","usage","gebrauch","anwendung","verzehrempfehlung","mode d'emploi","utilisation","modo d'uso","istruzioni","modo de empleo","modo de uso","gebruik","användning","sposób użycia","kullanım"];
  var SAFETY_WORDS = ["safety","warning","caution","sicherheit","warnhinweis","sécurité","avertissement","sicurezza","avvertenz","seguridad","advertencia","veiligheid","säkerhet","bezpieczeństw","güvenlik","uyarı"];
  var FACTS_WORDS = ["supplement facts","nutrition facts","nutritional","nährwert","valeurs nutritionnelles","valori nutrizionali","información nutricional","informacion nutricional","voedingswaarde","näringsvärde","wartości odżywcze","besin değer"];
  var SKIP_SECTION = ["legal disclaimer","rechtlicher hinweis","avertissement légal","disclaimer","esclusione di responsabilità","aviso legal"];
  var JUNK_KEYS = /^(asin|best ?sellers? rank|customer reviews?|date first available|is discontinued|upc|ean|gtin|item model number|manufacturer reference|global trade|amazon bestseller|bestseller.?rang|kundenrezensionen|im angebot von amazon|durchschnittliche kundenbewertung|classement des meilleures ventes|commentaires client|date de mise en ligne|posizione nella classifica|recensioni dei clienti|disponibile su amazon|clasificación en los más vendidos|opiniones de los clientes|producto en amazon|plaatsing op amazon|klantbeoordelingen|department|country of origin\s*$)/i;
  var KEY_FIELDS = [
    ["Primary supplement type", ["primary supplement type","supplement type"]],
    ["Item form", ["item form","darreichungsform","forme du produit","forma dell'articolo","forma del producto"]],
    ["Unit count", ["unit count","number of items","anzahl der einheiten","nombre d'unités","numero di unità","número de unidades","item package quantity"]],
    ["Flavor", ["flavor","flavour","geschmack","saveur","gusto","sabor"]],
    ["Diet type", ["diet type","ernährungsweise","type de régime","tipo di dieta","tipo de dieta"]],
    ["Age range", ["age range"]],
    ["Specific uses", ["specific uses","product benefits","verwendungszweck","utilisations spécifiques"]],
    ["Special ingredients", ["special ingredients","material feature","besondere merkmale","caractéristiques du matériau"]],
    ["Allergen information", ["allergen","allergene","allergènes","allergeni","alérgenos"]]
  ];

  var hasWord = function (t, words) { t = (t || "").toLowerCase(); return words.some(function (w) { return t.indexOf(w) >= 0; }); };
  var isIngLabel = function (l) { l = trimP(l).toLowerCase(); return l.length > 0 && l.length < 60 && hasWord(l, ING_WORDS); };
  var penalty = function (l) { l = (l || "").toLowerCase(); return /\b(key|main|special|hauptbestandteil)\b|free from|frei von|sans /.test(l) ? 2 : 0; };
  var norm = function (s) { return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); };
  var cells = function (tr) { return Array.prototype.filter.call(tr.children, function (c) { return c.tagName === "TH" || c.tagName === "TD"; }); };

  function textAfter(h) {
    var parts = [];
    for (var s = h.nextSibling; s; s = s.nextSibling) {
      if (s.nodeType === 1 && /^H[2-5]$/.test(s.tagName)) break;
      var t = s.nodeType === 3 ? clean(s.nodeValue) : (s.nodeType === 1 ? textOf(s) : "");
      if (t) parts.push(t);
    }
    return clean(parts.join(" "));
  }

  function inlineScan(text) {
    var out = [], re = new RegExp(LABEL_G.source, "gi"), m;
    while ((m = re.exec(text))) {
      var start = m.index + m[0].length, rest = text.slice(start, start + 1800);
      var s = rest.search(STOP_RE); if (s >= 0) rest = rest.slice(0, s);
      var n = rest.search(LABEL_1); if (n > 0) rest = rest.slice(0, n);
      rest = clean(rest);
      if (rest.length >= 6) out.push([trimP(m[0]), rest]);
      if (!m[0].length) re.lastIndex++;
    }
    return out;
  }

  function candidates(doc) {
    var c = [];
    var add = function (source, label, text, prio) {
      text = trimP(text);
      if (text.length < 3 || text.length > 6000) return;
      c.push({source: source, label: trimP(label), text: text, priority: prio + penalty(label)});
    };
    var box = doc.querySelector("#important-information");
    if (box) {
      box.querySelectorAll("h3,h4,h5").forEach(function (h) {
        if (isIngLabel(textOf(h))) add("Important information", textOf(h), textAfter(h), 1);
      });
      inlineScan(textOf(box)).forEach(function (x) { add("Important information", x[0], x[1], 1); });
    }
    doc.querySelectorAll("table tr").forEach(function (tr) {
      var cs = cells(tr);
      if (cs.length >= 2 && isIngLabel(textOf(cs[0]))) {
        var ap = !!tr.closest("[id*='aplus']");
        add(ap ? "A+ content table" : "Product details", textOf(cs[0]), textOf(cs[1]), ap ? 4 : 2);
      }
    });
    doc.querySelectorAll("#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li").forEach(function (li) {
      var b = li.querySelector("span.a-text-bold");
      if (b && isIngLabel(textOf(b))) { var l = textOf(b); add("Product details", l, textOf(li).replace(l, "")); }
    });
    [["#feature-bullets","Bullet points",3],["#productFactsDesktopExpander","About this item",3],["#productDescription","Product description",3],
     ["#nutritionalInfoAndIngredients_feature_div","Nutrition and ingredients",1],["#aplus","A+ content",4],["#aplus_feature_div","A+ content",4]]
      .forEach(function (s) {
        doc.querySelectorAll(s[0]).forEach(function (node) {
          inlineScan(textOf(node)).forEach(function (x) { add(s[1], x[0], x[1], s[2]); });
        });
      });
    var best = {};
    c.forEach(function (x) { var k = norm(x.text).slice(0, 500) || x.text; if (!best[k] || x.priority < best[k].priority) best[k] = x; });
    var sorted = Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return a.priority - b.priority || b.text.length - a.text.length; });
    var kept = [];
    sorted.forEach(function (x) {
      var kx = norm(x.text);
      if (!kept.some(function (y) { return kx && norm(y.text).indexOf(kx) >= 0 && y.priority <= x.priority; })) kept.push(x);
    });
    return kept;
  }

  function splitIngredients(text) {
    var t = text, m = t.match(LABEL_1);
    if (m && m.index === 0) t = t.slice(m[0].length);
    t = t.trim().replace(/[.。]+$/, "");
    t = t.replace(/\.\s+(?=(?:active|inactive|other|non medicinal|medicinal)\s+ingredients?\s*[:：])/gi, ", ");
    var items = [], buf = "", d = 0;
    for (var ch of t) {
      if ("([{（".indexOf(ch) >= 0) d++;
      else if (")]}）".indexOf(ch) >= 0) d = Math.max(0, d - 1);
      if (",;、，；".indexOf(ch) >= 0 && d === 0) { items.push(buf); buf = ""; } else buf += ch;
    }
    items.push(buf);
    var tidy = function (i) { return clean(i).replace(/^[\s.]+|[\s.]+$/g, ""); };
    items = items.map(tidy).filter(Boolean);
    if (items.length <= 1 && /\s[•|·]\s/.test(t)) items = t.split(/\s[•|·]\s/).map(tidy).filter(Boolean);
    return items;
  }

  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  function sections(doc) {
    var out = {directions: [], safety: [], facts_text: [], other: []};
    var box = doc.querySelector("#important-information");
    if (box) box.querySelectorAll("h3,h4,h5").forEach(function (h) {
      var head = trimP(textOf(h)), body = textAfter(h);
      if (!body || isIngLabel(head) || hasWord(head, SKIP_SECTION)) return;
      if (hasWord(head, FACTS_WORDS)) out.facts_text.push(body);
      else if (hasWord(head, DIRECTION_WORDS)) out.directions.push(body);
      else if (hasWord(head, SAFETY_WORDS)) out.safety.push(body);
      else if (head.toLowerCase() !== "important information") out.other.push({label: head, text: body});
    });
    ["#productDescription", "#feature-bullets", "#aplus"].forEach(function (sel) {
      doc.querySelectorAll(sel).forEach(function (node) {
        var text = textOf(node), re = new RegExp(FACTS_G.source, "gi"), m;
        while ((m = re.exec(text))) {
          var start = m.index + m[0].length, rest = text.slice(start, start + 1500);
          [STOP_RE, LABEL_1].forEach(function (rx) { var s = rest.search(rx); if (s > 20) rest = rest.slice(0, s); });
          rest = clean(rest);
          if (rest.length > 15) out.facts_text.push(rest);
          if (!m[0].length) re.lastIndex++;
        }
      });
    });
    out.directions = uniq(out.directions); out.safety = uniq(out.safety); out.facts_text = uniq(out.facts_text);
    return out;
  }

  function factsTable(doc) {
    var rows = [], seenT = new Set(), seenR = new Set();
    doc.querySelectorAll("#nutritionalInfoAndIngredients_feature_div, [id*='nutrition' i], [id*='supplementFacts' i]").forEach(function (node) {
      node.querySelectorAll("table").forEach(function (t) {
        if (seenT.has(t)) return; seenT.add(t);
        t.querySelectorAll("tr").forEach(function (tr) {
          var r = cells(tr).map(textOf).filter(Boolean);
          var k = r.join("|");
          if (r.length && !(r.length === 1 && r[0].length > 80) && !seenR.has(k)) { seenR.add(k); rows.push(r); }
        });
      });
    });
    return rows;
  }

  function details(doc) {
    var rows = [];
    doc.querySelectorAll("#productOverview_feature_div tr, #productDetails_techSpec_section_1 tr, #productDetails_techSpec_section_2 tr, #productDetails_detailBullets_sections1 tr, #technicalSpecifications_section_1 tr, #prodDetails tr, #tech tr")
      .forEach(function (tr) { var cs = cells(tr); if (cs.length >= 2) rows.push([textOf(cs[0]), textOf(cs[1])]); });
    doc.querySelectorAll("#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li").forEach(function (li) {
      var b = li.querySelector("span.a-text-bold");
      if (b) { var l = textOf(b); rows.push([l, textOf(li).replace(l, "")]); }
    });
    var out = [], seen = {};
    rows.forEach(function (r) {
      var k = trimP(r[0]), v = trimP(r[1]);
      if (!k || !v || k.length > 60 || v.length > 600 || JUNK_KEYS.test(k) || isIngLabel(k) || seen[k.toLowerCase()]) return;
      seen[k.toLowerCase()] = 1;
      out.push({label: k, value: v});
    });
    return out;
  }

  function keyFields(det) {
    var f = {};
    KEY_FIELDS.forEach(function (kf) {
      for (var i = 0; i < det.length; i++) if (hasWord(det[i].label, kf[1])) { f[kf[0]] = det[i].value; break; }
    });
    return f;
  }

  function pageInfo(doc, url, raw) {
    var u = url || "", canon = doc.querySelector("link[rel=canonical]");
    if (canon && /amazon\./.test(canon.getAttribute("href") || "")) u = canon.getAttribute("href");
    if (!/amazon\./.test(u) && raw) { var sm = raw.match(/saved from url=\(\d+\)(\S+)/); if (sm) u = sm[1]; }
    var asin = "", inp = doc.querySelector("#ASIN, input[name='ASIN']");
    if (inp) asin = inp.getAttribute("value") || inp.value || "";
    if (!asin) { var m = u.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i); if (m) asin = m[1]; }
    var host = ""; try { host = new URL(u).hostname.replace(/^(www|smile|m)\./, ""); } catch (e) {}
    asin = asin.toUpperCase();
    return {asin: asin, domain: MP[host] ? host : "", url: asin && MP[host] ? "https://www." + host + "/dp/" + asin : u};
  }

  function photos(doc) {
    var urls = [], html = Array.prototype.map.call(doc.querySelectorAll("script"), function (x) { return x.textContent; }).join("\n");
    var i = html.search(/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*\[/);
    if (i >= 0) {
      var st = html.indexOf("[", i), depth = 0, inStr = false, j;
      for (j = st; j < html.length; j++) {
        var ch = html[j];
        if (inStr) { if (ch === "\\") { j++; continue; } if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true; else if (ch === "[") depth++; else if (ch === "]") { depth--; if (!depth) break; }
      }
      try { JSON.parse(html.slice(st, j + 1)).forEach(function (it) { var u = it.hiRes || it.large; if (u) urls.push(u); }); } catch (e) {}
    }
    if (!urls.length) doc.querySelectorAll("#altImages img").forEach(function (im) {
      var s = im.getAttribute("src") || "";
      if (/^https:.*\/images\/I\//.test(s)) urls.push(s.replace(/\._[^/]*?_(?=\.[a-z]{3,4}$)/i, ""));
    });
    return urls.filter(function (x, k) { return urls.indexOf(x) === k; });
  }

  function extract(doc, url, raw) {
    var info = pageInfo(doc, url, raw);
    var r = {asin: info.asin, domain: info.domain, marketplace: MP[info.domain] || "", url: info.url, status: "ok", message: "",
      title: textOf(doc.querySelector("#productTitle")), brand: textOf(doc.querySelector("#bylineInfo")), image: "",
      final: null, candidates: [], photos: [], facts_table: [], facts_text: [], directions: [], safety: [], other_info: [], key_fields: {}, details: [], bullets: []};
    if (!r.title) {
      var low = (raw || (doc.documentElement ? doc.documentElement.innerHTML : "")).toLowerCase();
      r.status = "blocked";
      r.message = (low.indexOf("validatecaptcha") >= 0 || low.indexOf("enter the characters you see below") >= 0)
        ? "This page is an Amazon robot check, not a product page. Open the product again and save it once it shows normally."
        : "This is not an Amazon product detail page.";
      return r;
    }
    var img = doc.querySelector("#landingImage, #imgBlkFront");
    if (img) { var s = img.getAttribute("data-old-hires") || img.getAttribute("src") || ""; if (/^https:/.test(s)) r.image = s; }
    r.candidates = candidates(doc);
    if (r.candidates.length) {
      var b = r.candidates[0], p = b.priority;
      r.final = {text: b.text, list: splitIngredients(b.text), source: b.source, confidence: p <= 2 ? "High" : (p === 3 ? "Medium" : "Low")};
    }
    var sec = sections(doc);
    r.facts_text = sec.facts_text; r.directions = sec.directions; r.safety = sec.safety; r.other_info = sec.other;
    r.facts_table = factsTable(doc);
    r.details = details(doc);
    r.key_fields = keyFields(r.details);
    var bl = [];
    doc.querySelectorAll("#feature-bullets li, #productFactsDesktopExpander li").forEach(function (li) { var t = textOf(li); if (t.length > 3 && bl.indexOf(t) < 0) bl.push(t); });
    r.bullets = bl;
    r.photos = photos(doc);
    return r;
  }

  function card(r) {
    var where = (r.asin || "Unknown ASIN") + (r.domain ? " on " + r.domain : "");
    if (r.status !== "ok") {
      return '<article class="facts problem"><h2>Not read</h2><p class="asin">' + esc(r.file || where) + '</p><div class="bar thick"></div><p class="why">' + esc(r.message) + "</p></article>";
    }
    var f = r.final, h = '<h2>Ingredients</h2><div class="who">' + (r.image ? '<img src="' + esc(r.image) + '" alt="">' : "") +
      '<div><p class="asin">' + esc(where) + '</p><p class="ptitle">' + esc(r.title) + '</p></div></div><div class="bar thick"></div>';
    if (f && f.list.length) {
      h += '<ol class="ing">' + f.list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ol><div class="bar mid"></div>' +
        '<p class="meta">Source: ' + esc(f.source) + '. Confidence: <span class="conf ' + esc(f.confidence) + '">' + esc(f.confidence) + "</span></p>";
    } else h += '<p class="none">This detail page has no ingredient list.</p>';
    var ft = "";
    if (r.facts_table.length) {
      var w = Math.max.apply(null, r.facts_table.map(function (x) { return x.length; }));
      ft += '<table class="sf">' + r.facts_table.map(function (row) {
        var cs = row.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("");
        for (var i = row.length; i < w; i++) cs += "<td></td>";
        return "<tr>" + cs + "</tr>";
      }).join("") + "</table>";
    }
    r.facts_text.forEach(function (x) { ft += '<div class="raw">' + esc(x) + "</div>"; });
    if (ft) h += '<h3 class="sub">Supplement facts</h3><div class="bar mid"></div>' + ft;
    var kf = Object.keys(r.key_fields);
    if (kf.length) h += '<h3 class="sub">Supplement details</h3><div class="kv">' + kf.map(function (k) { return "<div>" + esc(k) + "</div><div>" + esc(r.key_fields[k]) + "</div>"; }).join("") + "</div>";
    if (r.directions.length) h += '<h3 class="sub">Directions</h3>' + r.directions.map(function (x) { return '<p class="block">' + esc(x) + "</p>"; }).join("");
    if (r.safety.length) h += '<h3 class="sub">Safety information</h3>' + r.safety.map(function (x) { return '<p class="block">' + esc(x) + "</p>"; }).join("");
    r.other_info.forEach(function (o) { h += '<h3 class="sub">' + esc(o.label) + '</h3><p class="block">' + esc(o.text) + "</p>"; });
    if (r.url && /^https:/.test(r.url)) h += '<div class="tools"><a class="btn" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open on Amazon</a></div>';
    if (f) h += '<details class="more"><summary>Exact ingredient text as written</summary><div class="raw">' + esc(f.text) + "</div></details>";
    if (r.details.length) h += '<details class="more"><summary>All product details (' + r.details.length + ')</summary><div class="kv" style="margin-top:8px">' +
      r.details.map(function (d) { return "<div>" + esc(d.label) + "</div><div>" + esc(d.value) + "</div>"; }).join("") + "</div></details>";
    if (r.bullets.length) h += '<details class="more"><summary>About this item</summary><ul class="bul">' + r.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul></details>";
    if ((r.photos || []).length) h += '<details class="more"' + (r.facts_table.length ? '' : ' open') + '><summary>Product photos (' + r.photos.length + ')</summary>' +
      '<p class="hint2">Need the mg amounts from the label photo? Right click the label photo, choose Copy image, and paste it into Ingredient Finder under Read a label photo.</p><div class="thumbs">' +
      r.photos.map(function (u, k) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener" data-photo="' + esc(u) + '"><img src="' + esc(u) + '" alt="Photo ' + (k + 1) + '" loading="lazy"></a>'; }).join("") + "</div></details>";
    var others = r.candidates.slice(1);
    if (others.length) h += '<details class="more"><summary>Other places the ingredients appear (' + others.length + ")</summary>" +
      others.map(function (c) { return '<div class="cand"><b>' + esc(c.source) + ', "' + esc(c.label) + '"</b>' + esc(c.text) + "</div>"; }).join("") + "</details>";
    return '<article class="facts">' + h + "</article>";
  }

  function csv(rows) {
    var names = KEY_FIELDS.map(function (k) { return k[0]; });
    var head = ["ASIN","Marketplace","Title","Brand","Status","Ingredients","Ingredient count","Ingredient source","Supplement facts"].concat(names, ["Directions","Safety information","Other details","URL"]);
    var data = rows.map(function (r) {
      var k = r.key_fields || {}, shown = Object.keys(k).map(function (x) { return k[x]; });
      var facts = [(r.facts_table || []).map(function (x) { return x.join(" "); }).join("; ")].concat(r.facts_text || []).filter(Boolean).join(" | ");
      return [r.asin || r.file || "", r.marketplace || "", r.title || "", r.brand || "", r.status === "ok" ? "OK" : r.message,
        r.final ? r.final.list.join(", ") : "", r.final ? r.final.list.length : "", r.final ? r.final.source : "", facts]
        .concat(names.map(function (n) { return k[n] || ""; }),
          [(r.directions || []).join(" "), (r.safety || []).join(" "),
           (r.details || []).filter(function (d) { return shown.indexOf(d.value) < 0; }).map(function (d) { return d.label + ": " + d.value; }).join("; "), r.url || ""]);
    });
    return [head].concat(data).map(function (row) { return row.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
  }

  function download(text, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + text], {type: "text/csv;charset=utf-8"}));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  var css = [
    ".ifs{--paper:#E6E9EC;--panel:#FFFFFF;--ink:#000000;--muted:#555C63;--rule:#000000;--mark:#F4E04D;--markInk:#000000;--bad:#B3261E;--warn:#9A5B00;--field:#F4F6F8;",
    "color:var(--ink);font-family:Archivo,'Arial Narrow','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.5;text-align:left}",
    "@media (prefers-color-scheme:dark){.ifs{--paper:#16181B;--panel:#202327;--ink:#F1F2F3;--muted:#A4AAB1;--rule:#F1F2F3;--field:#2A2E33;--bad:#FF8A80;--warn:#FFB74D}}",
    ".ifs *{box-sizing:border-box}",
    ".ifs button,.ifs .btn{font:inherit;font-weight:800;border:2px solid var(--rule);background:var(--panel);color:var(--ink);padding:8px 13px;cursor:pointer;border-radius:2px;display:inline-flex;align-items:center;text-decoration:none;font-size:15px}",
    ".ifs button.primary{background:var(--ink);color:var(--panel)}",
    ".ifs button:focus-visible,.ifs .btn:focus-visible,.ifs summary:focus-visible,.ifs textarea:focus-visible,.ifs select:focus-visible{outline:3px solid var(--mark);outline-offset:2px}",
    ".ifs textarea,.ifs select{width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--muted);padding:9px 10px;border-radius:2px}",
    ".facts{background:var(--panel);border:2px solid var(--rule);padding:14px 16px 16px}",
    ".facts h2{margin:0;font-weight:900;font-stretch:68%;font-size:44px;line-height:1}",
    ".facts .who{display:flex;gap:14px;align-items:flex-start;margin-top:8px}",
    ".facts .who img{width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--muted)}",
    ".facts .ptitle{margin:0;font-size:14px;color:var(--muted)}",
    ".facts .asin{font-weight:800;font-size:15px;margin:0}",
    ".bar{border-top:1px solid var(--rule);margin:10px 0}.bar.thick{border-top-width:10px}.bar.mid{border-top-width:4px}",
    "ol.ing{margin:0;padding:0;list-style:none;counter-reset:n}",
    "ol.ing li{counter-increment:n;display:grid;grid-template-columns:2.4em 1fr;border-bottom:1px solid var(--rule);padding:5px 0;font-size:15.5px}",
    "ol.ing li:last-child{border-bottom:0}",
    "ol.ing li::before{content:counter(n);font-weight:800;color:var(--muted)}",
    ".meta{font-size:14px;margin:0 0 4px}",
    ".conf{font-weight:800;padding:1px 6px}.conf.High{background:var(--mark);color:var(--markInk)}",
    ".conf.Medium{border:1px solid var(--warn);color:var(--warn)}.conf.Low{border:1px solid var(--bad);color:var(--bad)}",
    ".none{font-weight:700;margin:6px 0}",
    ".tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}",
    "details.more{margin-top:12px;border-top:1px solid var(--rule);padding-top:8px}",
    "details.more summary{cursor:pointer;font-weight:700;font-size:15px}",
    ".cand{margin:10px 0;font-size:14px}.cand b{display:block}",
    ".raw{font-size:14px;background:var(--field);padding:8px 10px;margin:8px 0 0;white-space:pre-wrap;word-break:break-word}",
    "table.sf{border-collapse:collapse;width:100%;font-size:14px;margin-top:8px}",
    "table.sf td{border-bottom:1px solid var(--rule);padding:4px 6px 4px 0;vertical-align:top}",
    ".kv{display:grid;grid-template-columns:minmax(9em,38%) 1fr;border-top:1px solid var(--rule)}",
    ".kv div{padding:5px 8px 5px 0;border-bottom:1px solid var(--rule);font-size:15px}.kv div:nth-child(odd){font-weight:700}",
    "h3.sub{margin:16px 0 4px;font-weight:900;font-stretch:75%;font-size:24px;line-height:1.1}",
    "p.block{margin:4px 0 0;font-size:15px}",
    "ul.bul{margin:6px 0 0 18px;padding:0;font-size:14.5px}",
    ".thumbs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.thumbs img{width:64px;height:64px;object-fit:contain;background:#fff;border:1px solid var(--muted);display:block}",
    ".hint2{font-size:13px;color:var(--muted);margin:6px 0 0}",
    ".problem h2{font-size:34px}.problem .why{font-weight:700;color:var(--bad);margin:8px 0 0}"
  ].join("");

  return {extract: extract, card: card, csv: csv, download: download, css: css, splitIngredients: splitIngredients, MP: MP};
})();
