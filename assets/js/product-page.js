document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client not available");
    return;
  }

  function getProductIdentifierFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "product" && pathParts[1]) {
      return {
        mode: "path",
        value: decodeURIComponent(pathParts[1])
      };
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("slug")) return { mode: "slug", value: params.get("slug") };
    if (params.get("asin")) return { mode: "asin", value: params.get("asin") };

    return null;
  }

  const identifier = getProductIdentifierFromURL();
  if (!identifier?.value) return;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function proxyImage(url = "") {
    const raw = String(url || "").trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function normalizeCategory(raw = "") {
    const value = String(raw).trim().toLowerCase();
    if (["men", "women", "jewelry"].includes(value)) return "fashion";
    if (["baby", "pets"].includes(value)) return "family";
    return value || "general";
  }

  function productUrl(product) {
    const slug = String(product?.slug || "").trim();
    const asin = String(product?.asin || "").trim();

    if (slug) return `/product/${encodeURIComponent(slug)}`;
    if (asin) return `/product/${encodeURIComponent(asin)}`;
    return "/catalog";
  }

  function sanitizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const originalPrice =
      safeNumber(row?.original_price, 0) > 0
        ? safeNumber(row.original_price, 0)
        : price > 0
          ? price * 1.5
          : 0;

    return {
      ...row,
      slug: String(row?.slug || "").trim() || String(row?.asin || "").trim(),
      asin: String(row?.asin || "").trim(),
      name: String(row?.name || "").trim() || "Amazon Product",
      description: row?.description || "",
      short_description: row?.short_description || "",
      category: normalizeCategory(row?.category),
      image_url: proxyImage(row?.image_url),
      price,
      original_price: originalPrice,
      discount_percentage: safeNumber(
        row?.discount_percentage ?? row?.discount_percent,
        0
      ),
      amazon_rating: safeNumber(row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.amazon_review_count, 0),
      source_kind: row?.source_kind || row?.type || "catalog"
    };
  }

  function computeScore(product) {
    return (
      safeNumber(product.amazon_review_count, 0) * 0.4 +
      safeNumber(product.amazon_rating, 0) * 100 * 0.3 +
      safeNumber(product.discount_percentage, 20) * 10 * 0.2 +
      safeNumber(product.priority, 0) * 4
    );
  }

  function relatedCard(product) {
    const rating = safeNumber(product.amazon_rating);
    const reviews = safeNumber(product.amazon_review_count);
    const price = safeNumber(product.price);
    const image = proxyImage(product.image_url);
    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";

    return `
      <a href="${productUrl(product)}" class="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:scale-[1.02] hover:border-zinc-600">
        <img
          src="${image}"
          alt="${product.name || "Product"}"
          class="h-40 w-full rounded-xl bg-white object-contain"
          loading="lazy"
          onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
        />
        <div class="mt-3 text-xs font-semibold text-green-400">${hook}</div>
        <h3 class="mt-2 text-sm font-semibold text-white">${product.name || "Product"}</h3>
        <div class="mt-2 text-xs text-zinc-400">⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})</div>
        <div class="mt-2 font-bold text-green-400">$${price.toFixed(2)}</div>
      </a>
    `;
  }

  try {
    let product = null;

    if (identifier.mode === "slug" || identifier.mode === "path") {
      const rawValue = identifier.value;
      const looksLikeAsin = /^[A-Z0-9]{10}$/i.test(rawValue);

      let query = window.supabaseClient.from("products").select("*").limit(1);

      query = looksLikeAsin
        ? query.eq("asin", rawValue.toUpperCase())
        : query.eq("slug", rawValue);

      let { data, error } = await query;

      if ((!data || !data.length) && !looksLikeAsin) {
        const fallback = await window.supabaseClient
          .from("products")
          .select("*")
          .eq("asin", rawValue.toUpperCase())
          .limit(1);

        data = fallback.data;
        error = fallback.error;
      }

      if (error || !data || !data.length) {
        console.error("Product not found", error);
        return;
      }

      product = sanitizeProduct(data[0]);
    } else if (identifier.mode === "asin") {
      const { data, error } = await window.supabaseClient
        .from("products")
        .select("*")
        .eq("asin", String(identifier.value).toUpperCase())
        .limit(1);

      if (error || !data || !data.length) {
        console.error("Product not found", error);
        return;
      }

      product = sanitizeProduct(data[0]);
    }

    if (!product) return;

    const title = product.name || "Amazon Product";
    const description =
      product.short_description ||
      product.description ||
      `Browse ${title} on TrendPulse.`;

    const image = proxyImage(product.image_url);
    const price = safeNumber(product.price);
    const originalPrice = safeNumber(product.original_price) || price * 1.5;
    const rating = safeNumber(product.amazon_rating);
    const reviews = safeNumber(product.amazon_review_count);
    const category = normalizeCategory(product.category || "general");

    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Frequently bought";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";
    const productType = window.ProductHooks ? window.ProductHooks.inferProductType(product) : "generic";

    const canonicalUrl = product.slug
      ? `https://www.trend-pulse.shop/product/${encodeURIComponent(product.slug)}`
      : `https://www.trend-pulse.shop/product/${encodeURIComponent(product.asin || "")}`;

    const el = (id) => document.getElementById(id);

    if (el("product-title")) el("product-title").textContent = title;
    if (el("product-image")) {
      el("product-image").src = image;
      el("product-image").alt = title;
    }
    if (el("product-price")) el("product-price").textContent = `$${price.toFixed(2)}`;
    if (el("product-original-price")) el("product-original-price").textContent = `$${originalPrice.toFixed(2)}`;
    if (el("product-description")) el("product-description").textContent = description;
    if (el("product-rating")) el("product-rating").textContent = `⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})`;
    if (el("product-category")) el("product-category").textContent = capitalize(category);
    if (el("product-buy-link")) el("product-buy-link").href = product.affiliate_link || product.amazon_url || "#";
    if (el("product-breadcrumb")) el("product-breadcrumb").textContent = title;
    if (el("product-hook")) el("product-hook").textContent = hook;
    if (el("product-urgency")) el("product-urgency").textContent = `⚡ ${urgency}`;
    if (el("product-proof")) el("product-proof").textContent = proof;
    if (el("product-proof-badge")) el("product-proof-badge").textContent = proof;
    if (el("product-price-story")) el("product-price-story").textContent = priceStory;
    if (el("product-value-box")) el("product-value-box").textContent = priceStory;
    if (el("product-demand-box")) el("product-demand-box").textContent = proof;
    if (el("product-type-box")) el("product-type-box").textContent = capitalize(productType);

    document.title = `${title} | TrendPulse`;

    const { data: relatedProducts } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", category)
      .limit(24);

    const dedupedRelated = [];
    const seen = new Set();

    for (const item of relatedProducts || []) {
      const p = sanitizeProduct(item);
      const key = p.asin || p.slug || p.name;
      if (!key || key === (product.asin || product.slug)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedRelated.push({
        ...p,
        final_score: computeScore(p)
      });
    }

    dedupedRelated.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));

    if (el("related-products")) {
      el("related-products").innerHTML = dedupedRelated.slice(0, 4).map(relatedCard).join("");
    }
  } catch (err) {
    console.error("Product page error:", err);
  }
});
