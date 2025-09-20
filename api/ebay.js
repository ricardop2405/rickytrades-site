// Works on Vercel without keys. Shows your live eBay items for seller "rickytradesllc".
// Strategy:
// 1) Try eBay RSS directly.
// 2) If zero items, try the same URLs via a public read-only proxy (r.jina.ai).
// 3) If still zero, fetch the HTML results page and parse <li class="s-item"> cards.

const SELLER = "rickytradesllc";

module.exports = async function handler(req, res) {
  try {
    const items =
      (await tryRss(false))?.items?.length ? (await tryRss(false)).items
    : (await tryRss(true))?.items?.length  ? (await tryRss(true)).items
    : (await tryHtml(true))?.items          ? (await tryHtml(true)).items
    : [];

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items: [] });
  }
};

async function tryRss(useProxy) {
  const base = useProxy ? "https://r.jina.ai/http://www.ebay.com" : "https://www.ebay.com";
  const urls = [
    `${base}/sch/i.html?_ssn=${encodeURIComponent(SELLER)}&_sop=10&_rss=1`,
    `${base}/sch/i.html?_fss=1&_saslop=1&_sasl=${encodeURIComponent(SELLER)}&_sop=10&_rss=1`,
    `${base}/str/${encodeURIComponent(SELLER)}?_sop=10&_rss=1`,
  ];

  for (const url of urls) {
    const xml = await safeFetchText(url);
    const items = parseRss(xml);
    if (items.length) return { items };
  }
  return { items: [] };
}

async function tryHtml(useProxy) {
  const base = useProxy ? "https://r.jina.ai/http://www.ebay.com" : "https://www.ebay.com";
  const url = `${base}/sch/i.html?_ssn=${encodeURIComponent(SELLER)}&_sop=10`;
  const html = await safeFetchText(url);
  const items = parseHtmlCards(html);
  return { items };
}

async function safeFetchText(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Accept:
        "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.ebay.com/",
    },
    redirect: "follow",
  });
  return await r.text();
}

// --------- Parsers ---------
function parseRss(xml) {
  if (!xml || typeof xml !== "string") return [];
  const blocks = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = itemRe.exec(xml))) blocks.push(m[0]);
  while ((m = entryRe.exec(xml))) blocks.push(m[0]);

  const out = [];
  for (const b of blocks) {
    const title = pick(b, "title");
    const link = pick(b, "link") || pickAttr(b, "link", "href");
    const desc = pick(b, "description") || pick(b, "content") || "";

    const p1 = title && title.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const p2 = desc && desc.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const price = p1 ? parseFloat(p1[1]) : p2 ? parseFloat(p2[1]) : 0;

    const img1 = desc && desc.match(/<img[^>]+src="([^"]+)"/i);
    const img2 = b.match(/<media:content[^>]+url="([^"]+)"/i);
    const image = (img1 && img1[1]) || (img2 && img2[1]) || "";

    const url = link || "";
    const idFromUrl = (url.split("/itm/")[1] || "").replace(/[^0-9]/g, "");
    const id = idFromUrl || url || title;

    if (title && url) {
      out.push({
        id,
        title: cleanCdata(title),
        price,
        currency: "USD",
        image: image || "https://i.ebayimg.com/images/g/0kUAAOSw3Fxj4YbW/s-l500.jpg",
        url,
      });
    }
  }
  return out;
}

function parseHtmlCards(html) {
  if (!html || typeof html !== "string") return [];
  // Each search result is a <li class="s-item"> with an <a class="s-item__link"> and <span class="s-item__price">
  const out = [];
  const liRe = /<li[^>]*class="[^"]*s-item[^"]*"[\s\S]*?<\/li>/gi;
  let m;
  while ((m = liRe.exec(html))) {
    const block = m[0];
    const link = pickAttr(block, "a", "href") || "";
    const title = pickHtml(block, "h3") || pickHtml(block, "span") || "";
    const priceText = (block.match(/s-item__price[^>]*>([^<]+)/i) || [,""])[1].replace(/[^\d.]/g, "");
    const price = priceText ? parseFloat(priceText) : 0;
    const img = pickAttr(block, "img", "src") || pickAttr(block, "img", "data-src");
    if (link && title) {
      out.push({
        id: (link.split("/itm/")[1] || link).replace(/[^0-9]/g, "") || link,
        title: decodeHtml(title),
        price,
        currency: "USD",
        image: img || "https://i.ebayimg.com/images/g/0kUAAOSw3Fxj4YbW/s-l500.jpg",
        url: link,
      });
    }
  }
  return out;
}

// --------- tiny helpers ---------
function pick(xml, tag) {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? cleanCdata(m[1].trim()) : "";
}
function pickAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*?${attr}="([^"]+)"[^>]*?>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}
function pickHtml(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? cleanCdata(m[1].trim()) : "";
}
function cleanCdata(s) {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").trim();
}
function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
