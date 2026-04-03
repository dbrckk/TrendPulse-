import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RSS_FEEDS = process.env.RSS_FEEDS?.split(",") || [];

function extractImage(item) {
  // 1. enclosure (le plus fiable)
  if (item.enclosure?.url) return item.enclosure.url;

  // 2. media:content
  if (item["media:content"]?.url) return item["media:content"].url;

  // 3. media:thumbnail
  if (item["media:thumbnail"]?.url) return item["media:thumbnail"].url;

  // 4. chercher dans le HTML
  const content = item.content || item.contentSnippet || "";

  const match = content.match(/<img[^>]+src="([^">]+)"/);

  if (match && match[1]) return match[1];

  return null;
}

function extractAmazonUrl(item) {
  const link = item.link || "";

  if (link.includes("amazon")) return link;

  // fallback (reddit / slickdeals)
  const match = link.match(/https?:\/\/[^ ]*amazon\.com[^ ]*/);
  return match ? match[0] : null;
}

function extractASIN(url) {
  if (!url) return null;

  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

function extractPrice(title) {
  const match = title.match(/\$([0-9]+(\.[0-9]+)?)/);
  return match ? parseFloat(match[1]) : null;
}

async function run() {
  let allDeals = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.trim());

      for (const item of parsed.items) {
        const amazonUrl = extractAmazonUrl(item);
        const asin = extractASIN(amazonUrl);

        if (!amazonUrl || !asin) continue;

        const image = extractImage(item);

        allDeals.push({
          asin,
          name: item.title?.slice(0, 200) || "Amazon Product",
          description: item.contentSnippet || "",
          price: extractPrice(item.title) || 0,
          image_url: image,
          amazon_url: amazonUrl,
          affiliate_link: amazonUrl,
          category: "tech",
          type: "deal",
          is_active: true,
          source_name: feed,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    } catch (e) {
      console.error("Feed error:", feed, e.message);
    }
  }

  // remove duplicates
  const unique = Object.values(
    Object.fromEntries(allDeals.map((d) => [d.asin, d]))
  );

  console.log("Upserting", unique.length, "unique deals");

  const { error } = await supabase
    .from("products")
    .upsert(unique, { onConflict: "asin" });

  if (error) {
    console.error("Deal sync failed", error);
    process.exit(1);
  }

  console.log("Sync DONE");
}

run();
