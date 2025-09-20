// Vercel serverless function — NO API KEY NEEDED (uses public RSS)
// CommonJS version (no ESM warning)
module.exports = async function handler(req, res) {
  const seller = "rickytradesllc"; // your username
  const urls = [
    `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(seller)}&_sop=10&_rss=1`,
    `https://www.ebay.com/sch/i.html?_fss=1&_saslop=1&_sasl=${encodeURIComponent(seller)}&_sop=10&_rss=1`,
  ];

  try {
    const items = await fetchFirstWithItems(urls);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ items });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ items: [] });
  }
};

async function fetchFirstWithItems(urls) {
  for (const url of urls) {
    const r = await fetch(url, { headers: { "User-Agent": "RickyTradesFeed/1.0" } });
    const xml = await r.text();
    const items = parseRss(xml);
    if (items.length) return items;
  }
  return [];
}

function parseRss(xml) {
  const out = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const pick = (tag) =>
      (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [,""])[1]
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();

    const title = pick("title");
    const link  = pick("link");
    const desc  = pick("description");

    const p1 = title.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const p2 = desc.match(/\$\s?([0-9]+(?:\.[0-9]{2})?)/);
    const price = p1 ? parseFloat(p1[1]) : p2 ? parseFloat(p2[1]) : 0;

    const img1 = desc.match(/<img[^>]+src="([^"]+)"/i);
    const img2 = block.match(/<media:content[^>]+url="([^"]+)"/i);
    const image = img1 ? img1[1] : img2 ? img2[1] : "https://i.ebayimg.com/images/g/0kUAAOSw3Fxj4YbW/s-l500.jpg";

    out.push({
      id: (link.split("/itm/")[1] || link).replace(/[^0-9]/g, "") || link,
      title, price, currency: "USD", image, url: link,
    });
  }
  return out;
}
