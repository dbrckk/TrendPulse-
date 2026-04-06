document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client not available");
    return;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function proxyImage(url) {
    const raw = normalizeText(url);
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function normalizeCategory(raw) {
    const value = normalizeText(raw).toLowerCase();

    if (["men", "women", "jewelry", "jewellery", "shoes", "watches"].includes(value)) return "fashion";
    if (["baby", "kids", "pets", "toys"].includes(value)) return "family";
    if (["electronics", "gadget", "gaming", "computer", "computers", "phone", "phones", "audio"].includes(value)) return "tech";
    if (["furniture", "decor", "storage", "household", "office"].includes(value)) return "home";
    if (["cooking", "cookware", "appliances"].includes(value)) return "kitchen";
    if (["beauty", "skincare", "makeup", "cosmetics"].includes(value)) return "beauty";
    if (["health", "wellness", "supplement", "supplements"].includes(value)) return "health";
    if (["sport", "sports", "fitness", "outdoor", "exercise", "training"].includes(value)) return "sports";
    if (["travel", "luggage", "backpack", "bags"].includes(value)) return "travel";

    return value || "general";
  }

  function getProductIdentifierFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "product" && pathParts[1]) {
      return decodeURIComponent(pathParts[1]);
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("slug") || params.get("asin") || null;
  }

  function sanitizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const originalPrice =
      safeNumber(row?.original_price, 0) > 0
        ? safeNumber(row.original_price, 0)
        : price > 0
          ? Number((price * 1.5).toFixed(2))
          : 0;

    const discount =
      safeNumber(row?.discount_percentage ?? row?.discount_percent, 0) > 0
        ? safeNumber(row?.discount_percentage ?? row?.discount_percent, 0)
        : originalPrice > price && price > 0
          ? Math.round(((originalPrice - price) / originalPrice) * 100)
          : 0;

    return {
      id: row?.id || null,
      asin: normalizeText(row?.asin),
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),
      name: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      title: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      brand: normalizeText(row?.brand),
      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),
      category: normalizeCategory(row?.category),
      subcategory: normalizeText(row?.subcategory),
      image: proxyImage(row?.image || row?.image_url),
      image_url: proxyImage(row?.image || row?.image_url),
      price,
      original_price: originalPrice,
      discount_percentage: discount,
      rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      reviews: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      priority: safeNumber(row?.priority, 0),
      likes: safeNumber(row?.likes, 0),
      clicks: safeNumber(row?.clicks, 0),
      views: safeNumber(row?.views, 0),
      source_kind: normalizeText(row?.source_kind || row?.type || "catalog").toLowerCase(),
      affiliate: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      affiliate_link: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      amazon_url: normalizeText(
        row?.amazon_url || row?.affiliate || row?.affiliate_link || row?.link || "#"
      )
    };
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews, 0) * 0.4 +
      safeNumber(product.rating, 0) * 100 * 0.3 +
      safeNumber(product.discount_percentage, 0) * 10 * 0.2 +
      safeNumber(product.priority, 0) * 4 +
      safeNumber(product.likes, 0) * 2 +
      safeNumber(product.clicks, 0) * 1.5 +
      safeNumber(product.views, 0) * 0.15
    );
  }

  function getHook(product) {
    if (safeNumber(product.discount_percentage) >= 30) return "Big discount right now";
    if (safeNumber(product.reviews) >= 5000) return "Massively bought product";
    if (safeNumber(product.rating) >= 4.6) return "Highly rated by buyers";
    if (product.source_kind === "deal") return "Live deal available";
    return "Popular right now";
  }

  function getUrgency(product) {
    if (safeNumber(product.discount_percentage) >= 30) return "Discount may not last";
    if (safeNumber(product.reviews) >= 1000) return "Selling fast";
    return "Strong buyer interest";
  }

  function getProof(product) {
    if (safeNumber(product.reviews) >= 10000) return "Huge review volume";
    if (safeNumber(product.reviews) >= 1000) return "Frequently bought";
    if (safeNumber(product.rating) >= 4.5) return "Highly rated";
    return "Strong demand";
  }

  function getPriceStory(product) {
    if (safeNumber(product.discount_percentage) >= 30) return "High value for the current price";
    if (safeNumber(product.price) <= 25) return "Affordable product with steady demand";
    if (safeNumber(product.price) <= 50) return "Good price point for this category";
    return "High-demand product";
  }

  function inferProductType(product) {
    const haystack = [
      product.name,
      product.brand,
      product.description,
      product.short_description,
      product.category,
      product.subcategory
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (haystack.includes("gift")) return "gift pick";
    if (haystack.includes("deal")) return "deal pick";
    if (haystack.includes("travel")) return "travel pick";
    if (haystack.includes("kitchen")) return "kitchen pick";
    if (haystack.includes("beauty")) return "beauty pick";
    if (haystack.includes("tech") || haystack.includes("electronics") || haystack.includes("gadget")) {
      return "tech pick";
    }

    return "amazon pick";
  }

  function productUrl(product) {
    if (product.slug) return `/product/${encodeURIComponent(product.slug)}`;
    if (product.asin) return `/product/${encodeURIComponent(product.asin)}`;
    return "/catalog";
  }

  function relatedCard(product) {
    return `
      <a href="${productUrl(product)}" class="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:scale-[1.01] hover:border-zinc-700">
        <img
          src="${product.image_url}"
          alt="${product.name}"
          class="h-40 w-full rounded-xl bg-white object-contain"
          loading="lazy"
          onerror="this.src='https://via.placeholder.com/700x700?text=No+Image'"
        />
        <div class="mt-3 text-xs font-semibold text-green-400">${getHook(product)}</div>
        <h3 class="mt-2 text-sm font-semibold text-white">${product.name}</h3>
        <div class="mt-2 text-xs text-zinc-400">
          ⭐ ${safeNumber(product.rating) > 0 ? safeNumber(product.rating).toFixed(1) : "—"}
          (${safeNumber(product.reviews).toLocaleString()})
        </div>
        <div class="mt-2 text-lg font-bold text-green-400">$${safeNumber(product.price).toFixed(2)}</div>
      </a>
    `;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHref(id, value) {
    const el = document.getElementById(id);
    if (el) el.href = value;
  }

  function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  function setImage(id, src, alt) {
    const el = document.getElementById(id);
    if (!el) return;
    el.src = src;
    el.alt = alt;
  }

  function showBadge(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  try {
    const identifier = getProductIdentifierFromURL();
    if (!identifier) return;

    const maybeAsin = /^[A-Z0-9]{10}$/i.test(identifier);
    let data = null;
    let error = null;

    if (maybeAsin) {
      const result = await window.supabaseClient
        .from("products")
        .select("*")
        .eq("asin", identifier.toUpperCase())
        .limit(1);

      data = result.data;
      error = result.error;
    } else {
      const result = await window.supabaseClient
        .from("products")
        .select("*")
        .eq("slug", identifier)
        .limit(1);

      data = result.data;
      error = result.error;

      if ((!data || !data.length) && !error) {
        const fallback = await window.supabaseClient
          .from("products")
          .select("*")
          .eq("asin", identifier.toUpperCase())
          .limit(1);

        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error || !data || !data.length) {
      console.error("Product not found", error);
      return;
    }

    const product = sanitizeProduct(data[0]);

    const title = product.name;
    const description =
      product.short_description ||
      product.description ||
      `Browse ${title} on TrendPulse.`;

    const hook = getHook(product);
    const urgency = getUrgency(product);
    const proof = getProof(product);
    const priceStory = getPriceStory(product);
    const productType = inferProductType(product);
    const canonicalUrl = product.slug
      ? `https://www.trend-pulse.shop/product/${encodeURIComponent(product.slug)}`
      : `https://www.trend-pulse.shop/product/${encodeURIComponent(product.asin)}`;

    document.title = `${title} | TrendPulse`;

    const canonical = document.getElementById("canonical-url");
    if (canonical) canonical.setAttribute("href", canonicalUrl);

    setText("product-title", title);
    setImage("product-image", product.image_url, title);
    setText("product-price", `$${safeNumber(product.price).toFixed(2)}`);
    setText("product-original-price", `$${safeNumber(product.original_price).toFixed(2)}`);
    setText(
      "product-rating",
      `⭐ ${safeNumber(product.rating) > 0 ? safeNumber(product.rating).toFixed(1) : "—"} (${safeNumber(product.reviews).toLocaleString()})`
    );
    setText("product-category", capitalize(product.category));
    setText("product-description", description);
    setText("product-breadcrumb", title);
    setHref("product-buy-link", product.affiliate_link || product.amazon_url || "#");

    setText("product-hook", hook);
    setText("product-urgency", `⚡ ${urgency}`);
    setText("product-proof", proof);
    setText("product-proof-badge", proof);
    setText("product-price-story", priceStory);
    setText("product-value-box", priceStory);
    setText("product-demand-box", proof);
    setText("product-type-box", capitalize(productType));
    setText(
      "product-why-text",
      `${title} is surfaced in TrendPulse because it shows useful demand signals for the ${product.category} category, including reviews, rating, price positioning, and overall product relevance.`
    );

    showBadge("product-source-badge", product.source_kind === "deal" ? "Deal" : "Catalog");

    if (safeNumber(product.discount_percentage) > 0) {
      showBadge("product-discount-badge", `-${Math.round(product.discount_percentage)}%`);
    }

    setHtml(
      "related-product-categories",
      [
        { href: `/catalog/${encodeURIComponent(product.category)}`, label: `${capitalize(product.category)} Catalog` },
        { href: "/catalog", label: "All Categories" },
        { href: "/deals", label: "Latest Deals" }
      ]
        .map(
          (item) => `
            <a
              href="${item.href}"
              class="rounded-full border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              ${item.label}
            </a>
          `
        )
        .join("")
    );

    const relatedResult = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", product.category)
      .limit(24);

    if (relatedResult.error) {
      console.error("Related products error:", relatedResult.error);
      return;
    }

    const seen = new Set();
    const related = (relatedResult.data || [])
      .map(sanitizeProduct)
      .filter((p) => {
        const key = p.asin || p.slug || p.name;
        if (!key) return false;
        if (key === (product.asin || product.slug)) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p) => ({ ...p, score: computeScore(p) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    setHtml("related-products", related.map(relatedCard).join(""));
  } catch (err) {
    console.error("Product page error:", err);
  }
});
