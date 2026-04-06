(function () {
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

  function normalizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const original = safeNumber(row?.original_price, 0);

    return {
      id: row?.id || null,
      asin: normalizeText(row?.asin),
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),
      name: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      title: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      brand: normalizeText(row?.brand),
      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),

      image: normalizeText(row?.image || row?.image_url),
      image_url: normalizeText(row?.image || row?.image_url),

      price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,

      discount: safeNumber(row?.discount ?? row?.discount_percentage, 0),
      discount_percentage: safeNumber(row?.discount ?? row?.discount_percentage, 0),

      rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      reviews: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),

      category: normalizeCategory(row?.category),
      subcategory: normalizeText(row?.subcategory),

      affiliate: normalizeText(row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"),
      affiliate_link: normalizeText(row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"),
      amazon_url: normalizeText(row?.amazon_url || row?.affiliate || row?.affiliate_link || row?.link || "#"),

      priority: safeNumber(row?.priority, 0),
      clicks: safeNumber(row?.clicks, 0),
      views: safeNumber(row?.views, 0),
      likes: safeNumber(row?.likes, 0)
    };
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    if (!window.supabaseClient) return [];

    const { data, error } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalizeCategory(category))
      .limit(limit);

    if (error) {
      console.error("fetchCatalogByCategory error", error);
      return [];
    }

    return (data || []).map(normalizeProduct);
  }

  async function fetchTopProducts(limit = 24) {
    if (!window.supabaseClient) return [];

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .limit(limit);

    if (error) {
      console.error("fetchTopProducts error", error);
      return [];
    }

    return (data || []).map(normalizeProduct);
  }

  async function fetchCollectionProducts(config, limit = 24) {
    let products = await fetchCatalogByCategory(config.category, 120);

    if (config?.filter?.query) {
      const q = config.filter.query.toLowerCase();
      products = products.filter((p) =>
        `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)
      );
    }

    if (config?.filter?.maxPrice) {
      products = products.filter(
        (p) => safeNumber(p.price, 999999) <= config.filter.maxPrice
      );
    }

    return products.slice(0, limit);
  }

  window.TrendPulseData = {
    normalizeCategory,
    fetchCatalogByCategory,
    fetchTopProducts,
    fetchCollectionProducts
  };
})();
