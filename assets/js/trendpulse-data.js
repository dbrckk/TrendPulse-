(function () {
  const PAGE_SIZE = 100;

  function ensureClient() {
    if (!window.supabaseClient) {
      throw new Error("Supabase client is not initialized");
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
    if (["electronics", "gadgets", "gaming", "computer", "computers", "audio", "phone", "phones"].includes(v)) return "tech";
    if (["furniture", "decor", "storage", "household", "office"].includes(v)) return "home";
    if (["cooking", "cookware", "appliances"].includes(v)) return "kitchen";
    if (["skincare", "makeup", "cosmetics"].includes(v)) return "beauty";
    if (["fitness", "wellness", "supplements"].includes(v)) return "health";
    if (["outdoor", "exercise", "training"].includes(v)) return "sports";
    if (["luggage", "bags", "travel-accessories"].includes(v)) return "travel";

    return v || "general";
  }

  function proxyImage(url) {
    const raw = normalizeText(url);
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function sanitizeProduct(row = {}) {
    const price = safeNumber(row.price, 0);
    const originalPrice =
      safeNumber(row.original_price, 0) > 0
        ? safeNumber(row.original_price, 0)
        : price > 0
          ? Number((price * 1.5).toFixed(2))
          : 0;

    return {
      id: row.id || null,
      asin: normalizeText(row.asin),
      slug: normalizeText(row.slug) || normalizeText(row.asin),
      name: normalizeText(row.name) || normalizeText(row.title) || "Amazon Product",
      brand: normalizeText(row.brand),
      tagline: normalizeText(row.tagline),
      description: normalizeText(row.description),
      short_description: normalizeText(row.short_description),
      image_url: proxyImage(row.image_url || row.image),
      gallery_urls: Array.isArray(row.gallery_urls) ? row.gallery_urls : [],
      category: normalizeCategory(row.category),
      subcategory: normalizeText(row.subcategory),
      source_kind: normalizeText(row.source_kind || row.type || "catalog").toLowerCase(),
      source_name: normalizeText(row.source_name),
      source_rank: safeNumber(row.source_rank, 0),
      price,
      original_price: originalPrice,
      discount_percentage: safeNumber(row.discount_percentage ?? row.discount_percent, 0),
      amazon_rating: safeNumber(row.amazon_rating, 0),
      amazon_review_count: safeNumber(row.amazon_review_count, 0),
      score: safeNumber(row.score, 0),
      priority: safeNumber(row.priority, 0),
      likes: safeNumber(row.likes, 0),
      clicks: safeNumber(row.clicks, 0),
      views: safeNumber(row.views, 0),
      is_active: row.is_active !== false,
      affiliate_link: normalizeText(row.affiliate_link || row.affiliate_url || row.amazon_url || row.link || "#"),
      amazon_url: normalizeText(row.amazon_url || row.affiliate_link || row.link || "#"),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      published_at: row.published_at || null
    };
  }

  function dedupeProducts(items) {
    const seen = new Set();
    const out = [];

    for (const item of items || []) {
      const key =
        normalizeText(item.asin) ||
        normalizeText(item.slug) ||
        normalizeText(item.id) ||
        normalizeText(item.name);

      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out;
  }

  function computeScore(product) {
    const reviews = safeNumber(product.amazon_review_count, 0);
    const rating = safeNumber(product.amazon_rating, 0);
    const discount = safeNumber(product.discount_percentage, 0);
    const priority = safeNumber(product.priority, 0);
    const likes = safeNumber(product.likes, 0);
    const clicks = safeNumber(product.clicks, 0);
    const views = safeNumber(product.views, 0);
    const sourceBonus = product.source_kind === "deal" ? 120 : 0;

    return (
      reviews * 0.4 +
      rating * 100 * 0.3 +
      discount * 10 * 0.2 +
      priority * 4 +
      likes * 2 +
      clicks * 1.5 +
      views * 0.15 +
      sourceBonus
    );
  }

  async function fetchDeals(limit = PAGE_SIZE) {
    const client = ensureClient();
    const { data, error } = await client.from("deal_products").select("*").limit(limit);

    if (error) {
      console.error("[trendpulse-data] fetchDeals error:", error);
      return [];
    }

    return dedupeProducts(
      (data || [])
        .map(sanitizeProduct)
        .filter((p) => p.is_active !== false)
        .map((p) => ({ ...p, final_score: computeScore(p) }))
        .sort((a, b) => b.final_score - a.final_score)
    );
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    const client = ensureClient();
    const normalized = normalizeCategory(category);

    const { data, error } = await client
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalized)
      .limit(limit);

    if (error) {
      console.error("[trendpulse-data] fetchCatalogByCategory error:", error);
      return [];
    }

    return dedupeProducts(
      (data || [])
        .map(sanitizeProduct)
        .filter((p) => p.is_active !== false)
        .map((p) => ({ ...p, final_score: computeScore(p) }))
        .sort((a, b) => b.final_score - a.final_score)
    );
  }

  async function fetchCatalog(limit = PAGE_SIZE) {
    const client = ensureClient();
    const { data, error } = await client.from("catalog_category_feed").select("*").limit(limit);

    if (error) {
      console.error("[trendpulse-data] fetchCatalog error:", error);
      return [];
    }

    return dedupeProducts(
      (data || [])
        .map(sanitizeProduct)
        .filter((p) => p.is_active !== false)
        .map((p) => ({ ...p, final_score: computeScore(p) }))
        .sort((a, b) => b.final_score - a.final_score)
    );
  }

  async function fetchTopProducts(limit = PAGE_SIZE) {
    const client = ensureClient();
    const { data, error } = await client.from("products").select("*").limit(limit);

    if (error) {
      console.error("[trendpulse-data] fetchTopProducts error:", error);
      return [];
    }

    return dedupeProducts(
      (data || [])
        .map(sanitizeProduct)
        .filter((p) => p.is_active !== false)
        .map((p) => ({ ...p, final_score: computeScore(p) }))
        .sort((a, b) => b.final_score - a.final_score)
    );
  }

  async function fetchCollectionProducts(config = {}, limit = 24) {
    const baseCategory = normalizeCategory(config.category);
    let items = await fetchCatalogByCategory(baseCategory, 120);

    if (config.filter?.query) {
      const needle = normalizeText(config.filter.query).toLowerCase();
      items = items.filter((item) => {
        const haystack = [
          item.name,
          item.brand,
          item.description,
          item.short_description,
          item.category,
          item.subcategory
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(needle);
      });
    }

    if (config.filter?.maxPrice != null) {
      const maxPrice = safeNumber(config.filter.maxPrice, 0);
      items = items.filter((item) => safeNumber(item.price, 999999) <= maxPrice);
    }

    if (config.sort === "reviews") {
      items.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (config.sort === "rating") {
      items.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (config.sort === "price-low") {
      items.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else {
      items.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));
    }

    if (!items.length) {
      items = await fetchTopProducts(limit);
    }

    return items.slice(0, limit);
  }

  window.TrendPulseData = {
    fetchDeals,
    fetchCatalog,
    fetchCatalogByCategory,
    fetchTopProducts,
    fetchCollectionProducts,
    sanitizeProduct,
    computeScore,
    normalizeCategory
  };
})();
