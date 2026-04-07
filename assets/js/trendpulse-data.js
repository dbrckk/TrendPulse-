(function () {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value) {
    return String(value ?? "").trim();
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

    if (
      !raw ||
      raw === "null" ||
      raw === "undefined" ||
      raw.includes("undefined") ||
      raw.includes("placeholder") ||
      raw.includes("your-image-url.com")
    ) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }

    return raw;
  }

  function buildSlug(row) {
    const rawSlug =
      normalizeText(row?.slug) ||
      normalizeText(row?.asin) ||
      normalizeText(row?.id) ||
      normalizeText(row?.name) ||
      normalizeText(row?.title);

    return rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const original = safeNumber(
      row?.original_price ?? row?.old_price ?? row?.oldPrice,
      0
    );
    const explicitDiscount = safeNumber(
      row?.discount ??
        row?.discount_percentage ??
        row?.discount_percent,
      0
    );

    const computedDiscount =
      explicitDiscount > 0
        ? explicitDiscount
        : original > price && price > 0
          ? Math.round(((original - price) / original) * 100)
          : 0;

    const image =
      row?.image ||
      row?.image_url ||
      row?.thumbnail ||
      row?.thumbnail_url ||
      row?.product_image ||
      "";

    const affiliate =
      normalizeText(
        row?.affiliate ||
          row?.affiliate_link ||
          row?.amazon_url ||
          row?.url ||
          row?.link
      ) || "#";

    return {
      id: row?.id ?? null,
      asin: normalizeText(row?.asin),
      slug: buildSlug(row),

      name:
        normalizeText(row?.name) ||
        normalizeText(row?.title) ||
        "Amazon Product",
      title:
        normalizeText(row?.name) ||
        normalizeText(row?.title) ||
        "Amazon Product",
      brand: normalizeText(row?.brand),

      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),
      subcategory: normalizeText(row?.subcategory),

      image: proxyImage(image),
      image_url: proxyImage(image),

      price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,

      discount: computedDiscount,
      discount_percentage: computedDiscount,

      rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      reviews: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),

      category: normalizeCategory(row?.category),
      raw_category: normalizeText(row?.category),

      affiliate,
      affiliate_link: affiliate,
      amazon_url:
        normalizeText(row?.amazon_url) ||
        affiliate,

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
    return sortByScore(dedupeProducts((rows || []).map(normalizeProduct)));
  }

  async function runCandidates(candidates, limit) {
    for (const candidate of candidates) {
      try {
        const { label, run } = candidate;
        const { data, error } = await run();

        if (!error && Array.isArray(data) && data.length) {
          return prepareProducts(data).slice(0, limit);
        }

        if (error) {
          console.warn(`[TrendPulseData] ${label} failed:`, error.message || error);
        }
      } catch (err) {
        console.warn("[TrendPulseData] query crashed:", err);
      }
    }

    return [];
  }

  function requireClient() {
    if (!window.supabaseClient) {
      console.error("[TrendPulseData] Supabase client missing");
      return false;
    }
    return true;
  }

  async function fetchDeals(limit = 24) {
    if (!requireClient()) return [];

    return runCandidates(
      [
        {
          label: "deal_products",
          run: () =>
            window.supabaseClient
              .from("deal_products")
              .select("*")
              .limit(limit)
        },
        {
          label: "product_sources deal",
          run: () =>
            window.supabaseClient
              .from("product_sources")
              .select("*")
              .eq("source_kind", "deal")
              .eq("is_active", true)
              .limit(limit)
        },
        {
          label: "deals",
          run: () =>
            window.supabaseClient
              .from("deals")
              .select("*")
              .limit(limit)
        }
      ],
      limit
    );
  }

  async function fetchTopProducts(limit = 24) {
    if (!requireClient()) return [];

    const candidates = [
      {
        label: "products",
        run: () =>
          window.supabaseClient
            .from("products")
            .select("*")
            .limit(limit)
      },
      {
        label: "catalog_category_feed fallback",
        run: () =>
          window.supabaseClient
            .from("catalog_category_feed")
            .select("*")
            .limit(limit)
      }
    ];

    return runCandidates(candidates, limit);
  }

  async function fetchHomeFeed(limit = 24) {
    const deals = await fetchDeals(limit);
    if (deals.length) return deals;
    return fetchTopProducts(limit);
  }

  async function fetchCatalogByCategory(category, limit = 60) {
    if (!requireClient()) return [];

    const normalized = normalizeCategory(category);
    const raw = normalizeText(category);

    const candidates = [
      {
        label: "catalog_category_feed eq normalized",
        run: () =>
          window.supabaseClient
            .from("catalog_category_feed")
            .select("*")
            .eq("category", normalized)
            .limit(limit)
      },
      {
        label: "catalog_category_feed ilike normalized",
        run: () =>
          window.supabaseClient
            .from("catalog_category_feed")
            .select("*")
            .ilike("category", normalized)
            .limit(limit)
      },
      {
        label: "catalog_category_feed ilike raw",
        run: () =>
          window.supabaseClient
            .from("catalog_category_feed")
            .select("*")
            .ilike("category", raw)
            .limit(limit)
      },
      {
        label: "products eq normalized",
        run: () =>
          window.supabaseClient
            .from("products")
            .select("*")
            .eq("category", normalized)
            .limit(limit)
      },
      {
        label: "products ilike normalized",
        run: () =>
          window.supabaseClient
            .from("products")
            .select("*")
            .ilike("category", normalized)
            .limit(limit)
      },
      {
        label: "products ilike raw",
        run: () =>
          window.supabaseClient
            .from("products")
            .select("*")
            .ilike("category", raw)
            .limit(limit)
      }
    ];

    const products = await runCandidates(candidates, limit);
    console.log("[TrendPulseData] CATEGORY QUERY:", normalized, products.length);
    return products.slice(0, limit);
  }

  function filterByQuery(products, query) {
    const q = normalizeText(query).toLowerCase();
    if (!q) return products;

    return products.filter((p) =>
      [
        p.name,
        p.brand,
        p.description,
        p.short_description,
        p.category,
        p.subcategory,
        p.raw_category
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  function filterByMaxPrice(products, maxPrice) {
    if (maxPrice == null) return products;
    const max = safeNumber(maxPrice, 999999);
    return products.filter((p) => safeNumber(p.price, 999999) <= max);
  }

  function applySort(products, sort) {
    if (sort === "reviews") {
      return [...products].sort((a, b) => safeNumber(b.reviews) - safeNumber(a.reviews));
    }

    if (sort === "rating") {
      return [...products].sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
    }

    if (sort === "price-low") {
      return [...products].sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    }

    if (sort === "price-high") {
      return [...products].sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    }

    return sortByScore(products);
  }

  async function fetchCollectionProducts(config, limit = 24) {
    let products = await fetchCatalogByCategory(config?.category, 200);

    products = filterByQuery(products, config?.filter?.query);
    products = filterByMaxPrice(products, config?.filter?.maxPrice);
    products = applySort(products, config?.sort);

    if (!products.length) {
      const fallback = await fetchTopProducts(Math.max(limit, 24));
      return applySort(
        filterByMaxPrice(
          filterByQuery(fallback, config?.filter?.query),
          config?.filter?.maxPrice
        ),
        config?.sort
      ).slice(0, limit);
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
