// CommonJS serverless function for Vercel — NO eBay API key needed
// Tries multiple public RSS endpoints for seller "rickytradesllc"
// Includes a ?debug=1 mode to inspect the first part of the XML

const SELLER = "rickytradesllc";

module.exports = async function handler(req, res) {
  const urls = [
    // exact-seller RSS
    `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(SELLER)}&_sop=10&_rss=1`,
    // alternate seller search RSS
    `https://www.ebay.com/sch/i.html?_fss=1&_saslop=1&_sasl=${encodeURIComponent(SELLER)}&_sop=10&_rss=1`,
    // store items page RSS (works for some sellers)
    `https://www.ebay.com/str/${encodeURIComponent(SELLER)}?_sop=10&_rss=1`,
    // mobile domain (different backend)
    `https://m.ebay.com/sch/i.html?_ssn=${encodeURIComponent(SELLER)}&_sop=10&_rss=1`,
  ];

  try {
    const { items, xmlTried } = await fetchFirstWithItems(urls, req.query && req.query.debug);

    // Disable cache while we’re testing
    res.setHeader("Cache-Control", "no-store");

    if (req.query && req.query.debug) {
      return res.status(200).json({
        tried: xmlTried.map(x => ({ url: x.url, foundItems: x.count, sample: x.sample })),
        itemsCount: items.length,
        items: items.slice(0, 3),
      });
    }

    return res.status(200).json({ items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ items: [] });
  }
};

async function fetchFirstWithItems(urls, debug) {
  const tried = [];
  for (const url of urls) {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "RickyTradesFeed/1.0 (+https://rickytrades-site.vercel.app)",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.ebay.com/",
      },
    });
    const xml = await r.text();
    const items = parseRss(xml);

    if (debug) {
      tried.push({ url, count: items.length, sample: xml.slice(0, 600) });
    }

    if (items.length) {
      return { items, xmlTried: tried };
    }
  }
  return { items: [], xmlTried: tried };
}

function parseRss(xml) {
  const out = [];
  if (!xml || typeof xml !== "string") return out;

  // Match <item>…</item> OR <entry>…</entry> (case-insensitive)
  const blocks = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;

  let m;
  while ((m = itemRegex.exec(xml))) blocks.push(m[0]);
  while ((m = entryRegex.exec(xml))) blocks.push(m[0]);

  for (const block of blocks) {
    const title = pick(block, "title");
    const link = pick(block, "link") || pickAttr(block, "link", "href") || "";
    const desc = pick(block, "description") || pick(block, "content") || "";

    // Price: look in title then description/content (fallback)
    const p1 = title && title.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const p2 = desc && desc.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const price = p1 ? parseFloat(p1[1]) : p2 ? parseFloat(p2[1]) : 0;

    // Image: try <img src="..."> in description, then media:content url, then og:image
    const img1 = desc && desc.match(/<img[^>]+src="([^"]+)"/i);
    const img2 = block.match(/<media:content[^>]+url="([^"]+)"/i);
    const image =
      (img1 && img1[1]) ||
      (img2 && img2[1]) ||
      "https://i.ebayimg.com/images/g/0kUAAOSw3Fxj4YbW/s-l500.jpg";

    // Item URL: prefer the long URL; if entry has <link href="...">
    const url = link || "";

    // Item ID: try to extract the numeric ID from the URL
    const idFromUrl = (url.split("/itm/")[1] || "").replace(/[^0-9]/g, "");
    const id = idFromUrl || url || title;

    if (title && url) {
      out.push({
        id,
        title: cleanCdata(title),
        price,
        currency: "USD",
        image,
        url,
      });
    }
  }
  return out;
}

function pick(xml, tag) {
  // Get <tag>…</tag> ignoring case, supports CDATA
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? cleanCdata(m[1].trim()) : "";
}

function pickAttr(xml, tag, attr) {
  // Get <tag attr="..."> value (case-insensitive)
  const re = new RegExp(`<${tag}\\b[^>]*?${attr}="([^"]+)"[^>]*?>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function cleanCdata(s) {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").trim();
}
