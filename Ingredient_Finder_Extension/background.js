// Toolbar icon:
// on an Amazon product page it reads that product,
// on any other website it reads the supplement facts on that page,
// anywhere else it just opens Ingredient Finder.
chrome.action.onClicked.addListener(async function (tab) {
  var url = chrome.runtime.getURL("app.html");
  var turl = (tab && tab.url) || "";
  if (/^https:\/\/www\.amazon\.[a-z.]+\/.*(dp|gp\/product)\/[A-Z0-9]{10}/i.test(turl)) {
    url += "?u=" + encodeURIComponent(turl);
  } else if (/^https?:/.test(turl)) {
    try {
      var out = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: grabPage});
      if (out && out[0] && out[0].result) {
        await chrome.storage.session.set({ext_source: out[0].result});
        url += "?src=page";
      }
    } catch (e) {}
  }
  chrome.tabs.create({url: url});
});

// Runs inside the website you are looking at. Collects the text blocks that look like supplement facts.
function grabPage() {
  var heading = /supplement facts|nutrition facts|nutritional information|nutrition information|n[äa]hrwert|valeurs nutritionnelles|valori nutrizionali|informaci[oó]n nutricional|voedingswaarde/i;
  var amount = /\d\s?(mg|mcg|µg|μg|iu|g)\b/gi;
  var blocks = [], seen = new Set();
  var push = function (el) {
    if (!el || seen.has(el)) return; seen.add(el);
    var t = (el.innerText || "").trim();
    if (t.length > 30 && t.length < 6000) blocks.push(t);
  };
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), n, hits = 0;
  while ((n = w.nextNode()) && hits < 15) {
    if (heading.test(n.nodeValue)) {
      hits++;
      var el = n.parentElement;
      for (var k = 0; k < 6 && el; k++, el = el.parentElement) push(el);
    }
  }
  document.querySelectorAll("table").forEach(function (t) {
    if (((t.innerText || "").match(amount) || []).length >= 3) push(t);
  });
  var meta = function (sel) { var e = document.querySelector(sel); return e ? (e.getAttribute("content") || e.textContent || "").trim() : ""; };
  var info = {name: "", price: "", currency: "", image: "", rating: "", reviews: "", brand: ""};
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
    try {
      var data = JSON.parse(s.textContent), list = [].concat(data["@graph"] || data);
      list.forEach(function (d) {
        if (!d || !/product/i.test([].concat(d["@type"]).join(" "))) return;
        info.name = info.name || d.name || "";
        info.image = info.image || [].concat(d.image || "")[0] || "";
        info.brand = info.brand || (d.brand && (d.brand.name || d.brand)) || "";
        var o = [].concat(d.offers || [])[0];
        if (o) { info.price = info.price || String(o.price || o.lowPrice || ""); info.currency = info.currency || o.priceCurrency || ""; }
        if (d.aggregateRating) { info.rating = info.rating || String(d.aggregateRating.ratingValue || ""); info.reviews = info.reviews || String(d.aggregateRating.reviewCount || d.aggregateRating.ratingCount || ""); }
      });
    } catch (e) {}
  });
  return {
    url: location.href, host: location.hostname.replace(/^www\./, ""),
    title: info.name || meta('meta[property="og:title"]') || meta("h1") || document.title,
    price: ((info.currency || meta('meta[property="product:price:currency"]')) + " " + (info.price || meta('meta[property="product:price:amount"]') || meta('[itemprop="price"]'))).trim(),
    image: info.image || meta('meta[property="og:image"]'),
    rating: info.rating, reviews: info.reviews, brand: typeof info.brand === "string" ? info.brand : "",
    blocks: blocks.slice(0, 40), body: (document.body.innerText || "").slice(0, 80000)
  };
}
