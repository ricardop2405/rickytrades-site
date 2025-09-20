// Vercel serverless function (CommonJS) — no keys
// Pulls items from your public eBay seller page via a read-only proxy.
// Seller: rickytradesllc

const SELLER = "rickytradesllc";

// Proxy avoids eBay blocking serverless IPs
const SEARCH_URL =
  `https://r.jina.ai/http://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(SELLER)}&_sop=10`;

module.exports = async function handler(req, res) {
  try {
    const html = await fetchHtml(SEARCH_URL);
    const items = parseSearchHtml(html);

    // while testing, disable cache so changes show immediately
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items: [] });
  }
};

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.ebay.com/",
    },
    redirect: "follow",
  });
  return await r.text();
}

// Parse eBay search results cards: <li class="s-item"> … </li>
function parseSearchHtml(html) {
  if (!html || typeof html !== "string") return [];
  const out = [];

  // find each result card
  const liRe = /<li[^>]*class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const block = m[0];

    // link
    const link = pickAttr(block, "a", "href");
    if (!link || !/\/itm\//.test(link)) continue;

    // title
    const title =
      pickHtml(block, "h3") ||
      innerText(block, /class="s-item__title"/i) ||
      pickHtml(block, "span") ||
      "";

    // price
    const priceText =
      innerText(block, /class="s-item__price"/i) || "";
    const priceVal = priceText.replace(/[^\d.]/g, "");
    const price = priceVal ? parseFloat(priceVal) : 0;

    // image
    const image =
      pickAttr(block, "img", "src") ||
      pickAttr(block, "img", "data-src") ||
      "https://i.ebayimg.com/images/g/0kUAAOSw3Fxj4YbW/s-l500.jpg";

    out.push({
      id: (link.split("/itm/")[1] || link).replace(/[^0-9]/g, "") || link,
      title: decodeHtml(title),
      price,
      currency: "USD",
      image,
      url: link,
    });
  }

  return out;
}

// ---- helpers ----
function pickAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*?${attr}="([^"]+)"[^>]*?>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}
function pickHtml(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? stripTags(m[1]) : "";
}
function innerText(xml, classRe) {
  const m = xml.match(new RegExp(`<[^>]*${classRe.source}[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return m ? stripTags(m[1]) : "";
}
function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").trim();
}
function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
