var IFOCR = (function () {
  var Tesseract = window.Tesseract;
// two cleaned versions of the photo: soft (grey, stretched) and hard (black and white)
  function prepare(img) {
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height, big = Math.max(W, H);
    var scale = big < 1800 ? Math.min(4, 1800 / big) : (big > 3500 ? 3500 / big : 1);
    var w = Math.round(W * scale), h = Math.round(H * scale);
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var x = c.getContext("2d", {willReadFrequently: true});
    x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h), p = d.data, n = w * h, lum = new Uint8ClampedArray(n), sum = 0, i;
    for (i = 0; i < n; i++) { var v = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; lum[i] = v; sum += v; }
    var invert = sum / n < 128;
    var hist = new Array(256).fill(0);
    for (i = 0; i < n; i++) { if (invert) lum[i] = 255 - lum[i]; hist[lum[i]]++; }
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
    acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.01) { hi = i; break; } }
    var range = Math.max(1, hi - lo);
    var total = 0, sumB = 0, wB = 0, best = 0, th = 128;
    for (i = 0; i < 256; i++) total += i * hist[i];
    for (i = 0; i < 256; i++) {
      wB += hist[i]; if (!wB) continue; var wF = n - wB; if (!wF) break;
      sumB += i * hist[i]; var mB = sumB / wB, mF = (total - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = i; }
    }
    var soft = document.createElement("canvas"), hard = document.createElement("canvas");
    [soft, hard].forEach(function (cv, k) {
      cv.width = w; cv.height = h;
      var cx = cv.getContext("2d"), out = cx.createImageData(w, h), o = out.data;
      for (var j = 0; j < n; j++) {
        var g = k === 0 ? Math.max(0, Math.min(255, (lum[j] - lo) * 255 / range)) : (lum[j] > th ? 255 : 0);
        o[j * 4] = o[j * 4 + 1] = o[j * 4 + 2] = g; o[j * 4 + 3] = 255;
      }
      cx.putImageData(out, 0, 0);
    });
    return [soft, hard];
  }

  var clean = function (t) { return String(t || "").replace(/\s+/g, " ").trim(); };
  var AMT_RE = /^(.{2,90}?)\s*[:.]?\s+([0-9OolI][0-9OolI.,]*\s?(?:mg|mcg|µg|μg|ug|g|iu|i\.u\.|kcal|kj|cfu|billion cfu|mg ne|mg re|mg te|mg α-te))(?![a-z])\.?\s*(.*)$/i;
  var SERV_RE = /(serving size|portion size|daily dose|tagesdosis|tagesportion|verzehrempfehlung|dose journali[eè]re|portion journali[eè]re|dose giornaliera|porzione|dosis diaria|porci[oó]n|dagelijkse dosis|porcja)\s*[:：]?\s*(.+)/i;
  var ING_RE = /(?<![A-Za-zÀ-ÿ])((?:active|inactive|other|key)\s+)?(ingredients?|ingrédients?|ingredienti|ingredientes|ingrediënten|ingredienser|zutaten|składniki|içindekiler)\s*[:：;]?\s*/i;
  var STOP_RE = /^(directions?|suggested use|how to use|warnings?|caution|storage|allergen|\*|nrv|%\s?nrv|\*?\s?nrv|ri\b|vnr|ar\b|warnhinweis|verzehr|hinweis|conseil|utilisation|precau|avvert|modo|advert)/i;
  var letters = function (t) { return (t.match(/[A-Za-zÀ-ÿ]/g) || []).length; };

  // fixes single letter OCR slips using words that repeat on the same label (Mognesium -> Magnesium)
  function fixer(all) {
    var freq = {};
    (all.match(/[A-Za-zÀ-ÿ]{4,}/g) || []).forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
    var common = Object.keys(freq).filter(function (w) { return freq[w] >= 3; });
    var oneOff = function (a, b) { if (a.length !== b.length || a === b) return false; var d = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false; return d === 1; };
    return function (t) {
      return String(t || "").replace(/([a-z])!(?=[\s,.)]|$)/g, "$1l").replace(/[A-Za-zÀ-ÿ]{4,}/g, function (w) {
        if (freq[w] >= 3) return w;
        for (var i = 0; i < common.length; i++) if (oneOff(w, common[i])) return common[i];
        return w;
      });
    };
  }

  function parse(text) {
    var fix = fixer(text);
    var lines = text.split(/\r?\n/).map(clean).filter(Boolean);
    var res = {serving: "", rows: [], ingredients: ""};
    lines.forEach(function (l) {
      var sv = l.match(SERV_RE);
      if (sv && !res.serving) { res.serving = clean(sv[1].replace(/^./, function (c) { return c.toUpperCase(); }) + ": " + sv[2]); return; }
      if (ING_RE.test(l) && ING_RE.exec(l).index < 3) return;
      var m = l.match(AMT_RE);
      if (!m) return;
      var name = m[1].replace(/^[^A-Za-zÀ-ÿ(]+/, "").replace(/[\s|=_*.:;,"'~\-]+$/, "");
      if (letters(name) < 2 || /^(serving|per |amount|typical|average|portion)/i.test(name)) return;
      var amt = m[2].replace(/^[0-9OolI.,]+/, function (x) { return x.replace(/[Oo]/g, "0").replace(/[lI]/g, "1"); }).replace(/\s+/g, "");
      var extra = (m[3].match(/[0-9][0-9.,]*\s?(?:%|mg|mcg|µg|g|kj|kcal|iu)|\*{1,3}|†|‡/gi) || []).join(" ");
      res.rows.push([fix(name), amt, extra]);
    });
    var idx = -1;
    for (var i = 0; i < lines.length; i++) { var mm = ING_RE.exec(lines[i]); if (mm && letters(lines[i]) > 8) { idx = i; break; } }
    if (idx >= 0) {
      var first = lines[idx], mm2 = ING_RE.exec(first), parts = [first.slice(mm2.index)];
      for (var k = idx + 1; k < lines.length; k++) {
        var l2 = lines[k];
        if (STOP_RE.test(l2) || AMT_RE.test(l2) || l2.length < 4 || letters(l2) / l2.length < 0.5) break;
        parts.push(l2);
      }
      var joined = parts.reduce(function (a, b) { return /[A-Za-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + " " + b; });
      var toks = joined.split(" ");
      while (toks.length > 3) {
        var t = toks[toks.length - 1];
        var prev = toks[toks.length - 2] || "";
        if (letters(t) === 0 || (t.length <= 2 && (!/^[A-Za-z]\)?[.,]?$/.test(t) || letters(prev) === 0))) toks.pop(); else break;
      }
      res.ingredients = fix(clean(toks.join(" ")).replace(/[,;\s]+$/, ""));
    }
    return res;
  }


  var LANG = {"amazon.de":"deu","amazon.fr":"fra","amazon.com.be":"fra","amazon.it":"ita","amazon.es":"spa","amazon.com.mx":"spa",
              "amazon.nl":"nld","amazon.pl":"pol","amazon.se":"swe","amazon.com.tr":"tur","amazon.com.br":"por","amazon.co.jp":"jpn"};
  var workers = {}, log = null;

  function getWorker(domain) {
    var lang = LANG[domain] || "eng";
    if (!workers[lang]) {
      workers[lang] = Tesseract.createWorker(lang, 1, {
        workerPath: chrome.runtime.getURL("lib/worker.min.js"),
        corePath: chrome.runtime.getURL("lib/core"),
        langPath: lang === "eng" ? chrome.runtime.getURL("lib/lang") : "https://cdn.jsdelivr.net/npm/@tesseract.js-data/" + lang + "/4.0.0_best_int",
        workerBlobURL: false,
        logger: function (m) { if (log) log(m); }
      }).then(function (w) {
        return w.setParameters({tessedit_pageseg_mode: "6", preserve_interword_spaces: "1"}).then(function () { return w; });
      });
      workers[lang].catch(function () { delete workers[lang]; });
    }
    return workers[lang];
  }

  function bitmap(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("photo " + r.status); return r.blob(); })
      .then(function (b) { return createImageBitmap(b); }).catch(function () { return null; });
  }

  // Reads the product photos one by one until one looks like a supplement or nutrition facts panel.
  async function findLabel(r, onStatus) {
    var list = (r.photos || []).slice(1).concat((r.photos || []).slice(0, 1)).slice(0, 9);
    if (!list.length) return null;
    onStatus("Getting the photo reader ready...");
    var w = await getWorker(r.domain);
    var best = null;
    for (var i = 0; i < list.length; i++) {
      onStatus("Looking for the label in photo " + (i + 1) + " of " + list.length + "...");
      var bmp = await bitmap(list[i]);
      if (!bmp) continue;
      var v = prepare(bmp);
      var d = (await w.recognize(v[0])).data, p = parse(d.text);
      var sc = p.rows.length * 12 + (p.ingredients ? 20 : 0) + d.confidence / 10;
      if (!best || sc > best.score) best = {score: sc, url: list[i], parsed: p, text: d.text, conf: d.confidence, hard: v[1]};
      if (p.rows.length >= 3) break;
    }
    if (!best || (!best.parsed.rows.length && !best.parsed.ingredients)) return null;
    onStatus("Checking the label a second time...");
    var d2 = (await w.recognize(best.hard)).data, p2 = parse(d2.text);
    var s2 = p2.rows.length * 12 + (p2.ingredients ? 20 : 0) + d2.confidence / 10;
    if (s2 > best.score) { best.parsed = p2; best.text = d2.text; }
    best.hard = null;
    return best;
  }

  return {findLabel: findLabel, parse: parse};
})();
