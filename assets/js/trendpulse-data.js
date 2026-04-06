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
    if (["electronics", "gadget", "gaming", "computer", "computers", "phone", "phones", "audio"].includes(v)) return "tech";
    if (["furniture", "decor", "storage", "household", "office"].includes(v)) return "home";
    if (["cooking", "cookware", "appliances"].includes(v)) return "kitchen";
    if (["beauty", "skincare", "makeup", "cosmetics"].includes(v)) return "beauty";
    if (["health", "wellness", "supplement", "supplements"].includes(v)) return "health";
    if (["sport", "sports", "fitness", "outdoor", "exercise", "training"].includes(v)) return "sports";
    if (["travel", "luggage", "backpack", "bags"].includes(v)) return "travel";

    return v || "general";
  }

  function proxyImage(url) {
    const raw = normalizeText(url);
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function normalizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const original = safeNumber(row?.original_price, 0);
    const discount = safeNumber(row?.discount_percentage ?? row?.discount_percent, 0);

    return {
      id: row?.id || null,
      asin: normalizeText(row?.asin),
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),

      name: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      title: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      brand: normalizeText(row?.brand),

      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),
      tagline: normalizeText(row?.tagline),
      subcategory: normalizeText(row?.subcategory),

      image: proxyImage(row?.image_url || row?.image),
      image_url: proxyImage(row?.image_url || row?.image),

      price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,

      discount,
      discount_percentage: discount,

      rating: safeNumber(row?.amazon_rating, 0),
      reviews: safeNumber(row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.amazon_review_count, 0),

      category: normalizeCategory(row?.category),
      affiliate: normalizeText(row?.affiliate_link || row?.amazon_url || row?.link || "#"),
      affiliate_link: normalizeText(row?.affiliate_link || row?.amazon_url || row?.link || "#"),
      amazon_url: normalizeText(row?.amazon_url || row?.affiliate_link || row?.link || "#"),

      source_kind: normalizeText(row?.source_kind || row?.type || "catalog").toLowerCase(),
      source_name: normalizeText(row?.source_name),

      priority: safeNumber(row?.priority, 0),
      clicks: safeNumber(row?.clicks, 0),
      views: safeNumber(row?.views, 0),
      likes: safeNumber(row?.likes, 0),

      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
      published_at: row?.published_at || null,

      score: 0
    };
  }

  function dedupe(items) {
    const seen = new Set();

    return (items || []).filter((item) => {
      const key = item.asin || item.slug || item.name || item.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews) * 0.4 +
      safeNumber(product.rating) * 100 * 0.3 +
      safeNumber(product.discount) * 10 * 0.2 +
      safeNumber(product.priority) * 4 +
      safeNumber(product.likes) * 2 +
      safeNumber(product.clicks) * 1.5 +
      safeNumber(product.views) * 0.15
    );
  }

  function prepareRows(rows) {
    return dedupe((rows || []).map(normalizeProduct))
      .map((p) => ({ ...p, score: computeScore(p) }))
      .sort((a, b) => b.score - a.score);
  }

  async function fetchDeals(limit = 60) {
    const client = ensureClient();
    const { data, error } = await client
      .from("deal_products")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("Error fetching deals:", error);
      return [];
    }

    return prepareRows(data);
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    const client = ensureClient();
    const normalizedCategory = normalizeCategory(category);

    const { data, error } = await client
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalizedCategory)
      .limit(limit);

    if (error) {
      console.error("Error fetching category catalog:", error);
      return [];
    }

    return prepareRows(data);
  }

  async function fetchCatalog(limit = PAGE_SIZE) {
    const client = ensureClient();
    const { data, error } = await client
      .from("catalog_category_feed")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("Error fetching catalog:", error);
      return [];
    }

    return prepareRows(data);
  }

  async function fetchTopProducts(limit = 60) {
    const client = ensureClient();
    const { data, error } = await client
      .from("products")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("Error fetching top products:", error);
      return [];
    }

    return prepareRows(data);
  }

  async function fetchHomeFeed() {
    let items = await fetchDeals(30);

    if (!items.length) {
      console.warn("No live deals found, using product fallback.");
      items = await fetchTopProducts(30);
    }

    return items;
  }

  async function fetchCollectionProducts(config, limit = 24) {
    const safeConfig = config || {};
    let items = await fetchCatalogByCategory(safeConfig.category || "general", 120);

    if (safeConfig.filter?.query) {
      const needle = normalizeText(safeConfig.filter.query).toLowerCase();
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

    if (safeConfig.filter?.maxPrice != null) {
      const maxPrice = safeNumber(safeConfig.filter.maxPrice, 0);
      items = items.filter((item) => safeNumber(item.price, 999999) <= maxPrice);
    }

    if (safeConfig.sort === "reviews") {
      items.sort((a, b) => safeNumber(b.reviews) - safeNumber(a.reviews));
    } else if (safeConfig.sort === "rating") {
      items.sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
    } else if (safeConfig.sort === "price-low") {
      items.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else {
      items.sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
    }

    if (!items.length) {
      items = await fetchTopProducts(limit);
    }

    return items.slice(0, limit);
  }

  window.TrendPulseData = {
    fetchDeals,
    fetchCatalogByCategory,
    fetchCatalog,
    fetchTopProducts,
    fetchHomeFeed,
    fetchCollectionProducts,
    normalizeCategory,
    normalizeProduct
  };
})();
