// Vercel serverless function — NO API KEY NEEDED (uses public RSS)
export default async function handler(req, res) {
  const seller = process.env.EBAY_SELLER || "YOUR_SELLER_NAME";
  const url = `https://www.ebay.com/sch/i.html?_ssn=${encodeURIComponent(seller)}&_sop=10&_rss=1`;

  try {
    const r = await fetch(url, { headers: { "User-Agent": "RickyTradesFeed/1.0" } });
    const xml = await r.text();

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml))) {
      const block = m[1];
      const pick = (tag) =>
        (block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)) || [,""])[1]
          .replace(/<!\\[CDATA\\[(.*?)\\]\\]>/g, "$1").trim();

      const title = pick("title");
      const link = pick("link");
      const desc = pick("description");

      const priceMatch = title.match(/\\$\\s?([0-9]+(?:\\.[0-9]{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

      const imgMatch = desc.match(/<img[^>]+src="([^"]+)"/i);
      const image = imgMatch ? imgMatch[1] : "";

      items.push({ id: link.split("/itm/")[1] || link, title, price, currency: "USD", image, url: link });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ items });
  } catch {
    res.status(200).json({ items: [] });
  }
}
