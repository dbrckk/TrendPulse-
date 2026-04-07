(function () {
  function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
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
      raw.includes("your-image-url.com")
    ) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }

    return raw;
  }

  function slugify(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeProduct(row) {
    const price = safeNumber(row && row.price, 0);
    const original = safeNumber(
      row && (row.original_price ?? row.old_price ?? row.oldPrice),
      0
    );
    const explicitDiscount = safeNumber(
      row && (row.discount ?? row.discount_percentage ?? row.discount_percent),
      0
    );

    const discount =
      explicitDiscount > 0
        ? explicitDiscount
        : original > price && price > 0
          ? Math.round(((original - price) / original) * 100)
          : 0;

    const image =
      (row && (row.image || row.image_url || row.thumbnail || row.thumbnail_url || row.product_image)) ||
      "";

    const affiliate =
      normalizeText(
        row && (row.affiliate || row.affiliate_link || row.amazon_url || row.url || row.link)
      ) || "#";

    const slug =
      slugify(row && (row.slug || row.asin || row.id || row.name || row.title)) ||
      slugify("product");

    return {
      id: row && row.id ? row.id : null,
      asin: normalizeText(row && row.asin),
      slug: slug,
      name: normalizeText(row && (row.name || row.title)) || "Amazon Product",
      title: normalizeText(row && (row.name || row.title)) || "Amazon Product",
      brand: normalizeText(row && row.brand),
      description: normalizeText(row && row.description),
      short_description: normalizeText(row && row.short_description),
      subcategory: normalizeText(row && row.subcategory),
      image: proxyImage(image),
      image_url: proxyImage(image),
      price: price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,
      discount: discount,
      discount_percentage: discount,
      rating: safeNumber(row && (row.rating ?? row.amazon_rating), 0),
      reviews: safeNumber(row && (row.reviews ?? row.amazon_review_count), 0),
      amazon_rating: safeNumber(row && (row.rating ?? row.amazon_rating), 0),
      amazon_review_count: safeNumber(row && (row.reviews ?? row.amazon_review_count), 0),
      category: normalizeCategory(row && row.category),
      raw_category: normalizeText(row && row.category),
      affiliate: affiliate,
      affiliate_link: affiliate,
      amazon_url: normalizeText(row && row.amazon_url) || affiliate,
      priority: safeNumber(row && row.priority, 0),
      clicks: safeNumber(row && row.clicks, 0),
      views: safeNumber(row && row.views, 0),
      likes: safeNumber(row && row.likes, 0),
      source_kind: normalizeText(row && (row.source_kind || row.type || "catalog")).toLowerCase(),
      created_at: row && row.created_at ? row.created_at : null,
      updated_at: row && row.updated_at ? row.updated_at : null
    };
  }

  function dedupeProducts(products) {
    const seen = new Set();

    return (products || []).filter(function (product) {
      const key =
        normalizeText(product && product.asin) ||
        normalizeText(product && product.slug) ||
        normalizeText(product && product.id) ||
        normalizeText(product && product.name);

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeScore(product) {
    return (
      safeNumber(product && product.reviews, 0) * 0.4 +
      safeNumber(product && product.rating, 0) * 100 * 0.3 +
      safeNumber(product && product.discount, 0) * 10 * 0.2 +
      safeNumber(product && product.priority, 0) * 4 +
      safeNumber(product && product.likes, 0) * 2 +
      safeNumber(product && product.clicks, 0) * 1.5 +
      safeNumber(product && product.views, 0) * 0.15
    );
  }

  function sortByScore(products) {
    return (products || []).slice().sort(function (a, b) {
      return computeScore(b) - computeScore(a);
    });
  }

  function prepareProducts(rows) {
    return sortByScore(dedupeProducts((rows || []).map(normalizeProduct)));
  }

  function requireClient() {
    if (!window.supabaseClient) {
      console.error("[TrendPulseData] Supabase client missing");
      return false;
    }
    return true;
  }

  async function runCandidates(candidates, limit) {
    for (const candidate of candidates) {
      try {
        const result = await candidate.run();
        const data = result && result.data;
        const error = result && result.error;

        if (!error && Array.isArray(data) && data.length) {
          return prepareProducts(data).slice(0, limit);
        }

        if (error) {
          console.warn("[TrendPulseData] " + candidate.label + " failed:", error.message || error);
        }
      } catch (err) {
        console.warn("[TrendPulseData] query crashed:", err);
      }
    }

    return [];
  }

  async function fetchDeals(limit) {
    if (limit == null) limit = 24;
    if (!requireClient()) return [];

    return runCandidates(
      [
        {
          label: "deal_products",
          run: function () {
            return window.supabaseClient
              .from("deal_products")
              .select("*")
              .limit(limit);
          }
        },
        {
          label: "product_sources deal",
          run: function () {
            return window.supabaseClient
              .from("product_sources")
              .select("*")
              .eq("source_kind", "deal")
              .eq("is_active", true)
              .limit(limit);
          }
        },
        {
          label: "deals",
          run: function () {
            return window.supabaseClient
              .from("deals")
              .select("*")
              .limit(limit);
          }
        },
        {
          label: "products discounted fallback",
          run: function () {
            return window.supabaseClient
              .from("products")
              .select("*")
              .limit(limit);
          }
        }
      ],
      limit
    );
  }

  async function fetchTopProducts(limit) {
    if (limit == null) limit = 24;
    if (!requireClient()) return [];

    return runCandidates(
      [
        {
          label: "products",
          run: function () {
            return window.supabaseClient
              .from("products")
              .select("*")
              .limit(limit);
          }
        },
        {
          label: "catalog_category_feed fallback",
          run: function () {
            return window.supabaseClient
              .from("catalog_category_feed")
              .select("*")
              .limit(limit);
          }
        }
      ],
      limit
    );
  }

  async function fetchHomeFeed(limit) {
    if (limit == null) limit = 24;
    const deals = await fetchDeals(limit);
    if (deals.length) return deals;
    return fetchTopProducts(limit);
  }

  async function fetchCatalogByCategory(category, limit) {
    if (limit == null) limit = 60;
    if (!requireClient()) return [];

    const normalized = normalizeCategory(category);
    const raw = normalizeText(category);

    const products = await runCandidates(
      [
        {
          label: "catalog_category_feed eq normalized",
          run: function () {
            return window.supabaseClient
              .from("catalog_category_feed")
              .select("*")
              .eq("category", normalized)
              .limit(limit);
          }
        },
        {
          label: "catalog_category_feed ilike normalized",
          run: function () {
            return window.supabaseClient
              .from("catalog_category_feed")
              .select("*")
              .ilike("category", normalized)
              .limit(limit);
          }
        },
        {
          label: "catalog_category_feed ilike raw",
          run: function () {
            return window.supabaseClient
              .from("catalog_category_feed")
              .select("*")
              .ilike("category", raw)
              .limit(limit);
          }
        },
        {
          label: "products eq normalized",
          run: function () {
            return window.supabaseClient
              .from("products")
              .select("*")
              .eq("category", normalized)
              .limit(limit);
          }
        },
        {
          label: "products ilike normalized",
          run: function () {
            return window.supabaseClient
              .from("products")
              .select("*")
              .ilike("category", normalized)
              .limit(limit);
          }
        },
        {
          label: "products ilike raw",
          run: function () {
            return window.supabaseClient
              .from("products")
              .select("*")
              .ilike("category", raw)
              .limit(limit);
          }
        }
      ],
      limit
    );

    console.log("[TrendPulseData] CATEGORY QUERY:", normalized, products.length);
    return products.slice(0, limit);
  }

  function filterByQuery(products, query) {
    const q = normalizeText(query).toLowerCase();
    if (!q) return products;

    return (products || []).filter(function (p) {
      return [
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
        .includes(q);
    });
  }

  function filterByMaxPrice(products, maxPrice) {
    if (maxPrice == null) return products;
    const max = safeNumber(maxPrice, 999999);
    return (products || []).filter(function (p) {
      return safeNumber(p.price, 999999) <= max;
    });
  }

  function applySort(products, sort) {
    if (sort === "reviews") {
      return (products || []).slice().sort(function (a, b) {
        return safeNumber(b.reviews, 0) - safeNumber(a.reviews, 0);
      });
    }

    if (sort === "rating") {
      return (products || []).slice().sort(function (a, b) {
        return safeNumber(b.rating, 0) - safeNumber(a.rating, 0);
      });
    }

    if (sort === "price-low") {
      return (products || []).slice().sort(function (a, b) {
        return safeNumber(a.price, 0) - safeNumber(b.price, 0);
      });
    }

    if (sort === "price-high") {
      return (products || []).slice().sort(function (a, b) {
        return safeNumber(b.price, 0) - safeNumber(a.price, 0);
      });
    }

    return sortByScore(products || []);
  }

  async function fetchCollectionProducts(config, limit) {
    if (limit == null) limit = 24;

    let products = await fetchCatalogByCategory(config && config.category, 200);
    products = filterByQuery(products, config && config.filter && config.filter.query);
    products = filterByMaxPrice(products, config && config.filter && config.filter.maxPrice);
    products = applySort(products, config && config.sort);

    if (!products.length) {
      const fallback = await fetchTopProducts(Math.max(limit, 24));
      return applySort(
        filterByMaxPrice(
          filterByQuery(fallback, config && config.filter && config.filter.query),
          config && config.filter && config.filter.maxPrice
        ),
        config && config.sort
      ).slice(0, limit);
    }

    return products.slice(0, limit);
  }

  window.TrendPulseData = {
    normalizeCategory: normalizeCategory,
    normalizeProduct: normalizeProduct,
    computeScore: computeScore,
    fetchDeals: fetchDeals,
    fetchHomeFeed: fetchHomeFeed,
    fetchCatalogByCategory: fetchCatalogByCategory,
    fetchTopProducts: fetchTopProducts,
    fetchCollectionProducts: fetchCollectionProducts
  };
})();
