(function () {
  const PAGE_SIZE = 100;

  function ensureClient() {
    if (!window.supabaseClient) {
      throw new Error("Supabase client not initialized");
    }
    return window.supabaseClient;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeCategory(value) {
    const v = normalizeText(value).toLowerCase();

    if (["men", "women", "jewelry", "jewellery", "shoes", "watches"].includes(v)) return "fashion";
    if (["baby", "kids", "pets", "toys"].includes(v)) return "family";
    if (["electronics", "gadget", "gaming", "computer", "phone", "audio"].includes(v)) return "tech";
    if (["home", "furniture", "decor", "storage"].includes(v)) return "home";
    if (["kitchen", "cooking", "cookware"].includes(v)) return "kitchen";
    if (["beauty", "skincare", "makeup"].includes(v)) return "beauty";
    if (["health", "wellness", "supplement"].includes(v)) return "health";
    if (["sport", "fitness", "outdoor"].includes(v)) return "sports";
    if (["travel", "luggage", "backpack"].includes(v)) return "travel";

    return v || "general";
  }

  function normalizeProduct(row = {}) {
    const price = safeNumber(row.price, 0);
    const original = safeNumber(row.original_price, 0);

    return {
      id: row.id || null,
      asin: normalizeText(row.asin),
      slug: normalizeText(row.slug) || normalizeText(row.asin),

      name: normalizeText(row.name) || normalizeText(row.title) || "Amazon Product",
      brand: normalizeText(row.brand),

      image: normalizeText(row.image_url || row.image || "https://via.placeholder.com/400"),
      price: price,
      oldPrice: original > price ? original : null,

      discount: safeNumber(row.discount_percentage || row.discount_percent, 0),

      rating: safeNumber(row.amazon_rating, 0),
      reviews: safeNumber(row.amazon_review_count, 0),

      category: normalizeCategory(row.category),
      affiliate: normalizeText(row.affiliate_link || row.amazon_url || "#"),

      created_at: row.created_at || null
    };
  }

  function dedupe(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      const key = item.asin || item.slug || item.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeScore(p) {
    return (
      safeNumber(p.reviews) * 0.4 +
      safeNumber(p.rating) * 100 * 0.3 +
      safeNumber(p.discount) * 10 * 0.2
    );
  }

  async function fetchDeals(limit = 60) {
    const client = ensureClient();

    const { data, error } = await client
      .from("deal_products")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("Deals error:", error);
      return [];
    }

    return dedupe(
      (data || [])
        .map(normalizeProduct)
        .map((p) => ({ ...p, score: computeScore(p) }))
        .sort((a, b) => b.score - a.score)
    );
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    const client = ensureClient();

    const { data, error } = await client
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalizeCategory(category))
      .limit(limit);

    if (error) {
      console.error("Catalog error:", error);
      return [];
    }

    return dedupe(
      (data || [])
        .map(normalizeProduct)
        .map((p) => ({ ...p, score: computeScore(p) }))
        .sort((a, b) => b.score - a.score)
    );
  }

  async function fetchTopProducts(limit = 60) {
    const client = ensureClient();

    const { data, error } = await client
      .from("products")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("Products error:", error);
      return [];
    }

    return dedupe(
      (data || [])
        .map(normalizeProduct)
        .map((p) => ({ ...p, score: computeScore(p) }))
        .sort((a, b) => b.score - a.score)
    );
  }

  async function fetchHomeFeed() {
    let deals = await fetchDeals(30);

    if (!deals.length) {
      console.warn("No deals → fallback products");
      deals = await fetchTopProducts(30);
    }

    return deals;
  }

  window.TrendPulseData = {
    fetchDeals,
    fetchCatalogByCategory,
    fetchTopProducts,
    fetchHomeFeed
  };
})();
