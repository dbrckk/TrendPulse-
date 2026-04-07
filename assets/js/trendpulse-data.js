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
    const discount = safeNumber(
      row?.discount ?? row?.discount_percentage ?? row?.discount_percent,
      0
    );

    return {
      id: row?.id || null,
      asin: normalizeText(row?.asin),
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),

      name: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      title: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      brand: normalizeText(row?.brand),

      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),
      subcategory: normalizeText(row?.subcategory),

      image: proxyImage(row?.image || row?.image_url),
      image_url: proxyImage(row?.image || row?.image_url),

      price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,

      discount,
      discount_percentage: discount,

      rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      reviews: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),

      category: normalizeCategory(row?.category),

      affiliate: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      affiliate_link: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      amazon_url: normalizeText(
        row?.amazon_url || row?.affiliate || row?.affiliate_link || row?.link || "#"
      ),

      priority: safeNumber(row?.priority, 0),
      clicks: safeNumber(row?.clicks, 0),
      views: safeNumber(row?.views, 0),
      likes: safeNumber(row?.likes, 0),

      source_kind: normalizeText(row?.source_kind || row?.type || "catalog").toLowerCase(),

      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null
    };
  }

  function dedupeProducts(products) {
    const seen = new Set();

    return (products || []).filter((product) => {
      const key =
        normalizeText(product?.asin) ||
        normalizeText(product?.slug) ||
        normalizeText(product?.id) ||
        normalizeText(product?.name);

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews, 0) * 0.4 +
      safeNumber(product.rating, 0) * 100 * 0.3 +
      safeNumber(product.discount, 0) * 10 * 0.2 +
      safeNumber(product.priority, 0) * 4 +
      safeNumber(product.likes, 0) * 2 +
      safeNumber(product.clicks, 0) * 1.5 +
      safeNumber(product.views, 0) * 0.15
    );
  }

  function sortByScore(products) {
    return [...products].sort((a, b) => computeScore(b) - computeScore(a));
  }

  function prepareProducts(rows) {
    return sortByScore(
      dedupeProducts((rows || []).map(normalizeProduct))
    );
  }

  async function fetchDeals(limit = 24) {
    if (!window.supabaseClient) return [];

    const candidates = [
      {
        table: "deal_products",
        build: (query) => query.select("*").limit(limit)
      },
      {
        table: "product_sources",
        build: (query) =>
          query
            .select("*")
            .eq("source_kind", "deal")
            .eq("is_active", true)
            .limit(limit)
      },
      {
        table: "deals",
        build: (query) => query.select("*").limit(limit)
      }
    ];

    for (const candidate of candidates) {
      try {
        const { data, error } = await candidate.build(
          window.supabaseClient.from(candidate.table)
        );

        if (!error && Array.isArray(data) && data.length) {
          return prepareProducts(data).slice(0, limit);
        }

        if (error) {
          console.warn(`fetchDeals fallback from ${candidate.table}:`, error.message || error);
        }
      } catch (err) {
        console.warn(`fetchDeals failed on ${candidate.table}:`, err);
      }
    }

    return [];
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    if (!window.supabaseClient) return [];

    const normalized = normalizeCategory(category);

    const { data, error } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalized)
      .limit(limit);

    if (error) {
      console.error("fetchCatalogByCategory error", error);
      return [];
    }

    return prepareProducts(data).slice(0, limit);
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

    return prepareProducts(data).slice(0, limit);
  }

  async function fetchHomeFeed(limit = 24) {
    const deals = await fetchDeals(limit);

    if (deals.length) {
      return deals;
    }

    return fetchTopProducts(limit);
  }

  async function fetchCollectionProducts(config, limit = 24) {
    let products = await fetchCatalogByCategory(config.category, 200);

    if (config?.filter?.query) {
      const q = normalizeText(config.filter.query).toLowerCase();

      products = products.filter((p) =>
        [
          p.name,
          p.brand,
          p.description,
          p.short_description,
          p.category,
          p.subcategory
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (config?.filter?.maxPrice != null) {
      products = products.filter(
        (p) => safeNumber(p.price, 999999) <= safeNumber(config.filter.maxPrice, 999999)
      );
    }

    if (config?.sort === "reviews") {
      products = [...products].sort((a, b) => safeNumber(b.reviews) - safeNumber(a.reviews));
    } else if (config?.sort === "rating") {
      products = [...products].sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
    } else if (config?.sort === "price-low") {
      products = [...products].sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else if (config?.sort === "price-high") {
      products = [...products].sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    } else {
      products = sortByScore(products);
    }

    if (!products.length) {
      products = await fetchTopProducts(limit);
    }

    return products.slice(0, limit);
  }

  window.TrendPulseData = {
    normalizeCategory,
    normalizeProduct,
    computeScore,
    fetchDeals,
    fetchHomeFeed,
    fetchCatalogByCategory,
    fetchTopProducts,
    fetchCollectionProducts
  };
})();
