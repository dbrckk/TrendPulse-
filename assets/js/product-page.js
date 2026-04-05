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

    if (params.get("slug")) {
      return {
        mode: "slug",
        value: params.get("slug")
      };
    }

    if (params.get("asin")) {
      return {
        mode: "asin",
        value: params.get("asin")
      };
    }

    return null;
  }

  const identifier = getProductIdentifierFromURL();
  if (!identifier?.value) return;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function proxyImage(url = "") {
    const raw = String(url).trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  function productUrl(product) {
    if (product.slug) {
      return `/product/${encodeURIComponent(product.slug)}`;
    }
    return `/product/${encodeURIComponent(product.asin || "")}`;
  }

  function normalizeCategory(raw = "") {
    const value = String(raw).trim().toLowerCase();
    if (["men", "women", "jewelry"].includes(value)) return "fashion";
    if (["baby", "pets"].includes(value)) return "family";
    return value || "general";
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function getDiscount(product) {
    const price = safeNumber(product.price, 0);
    const original = safeNumber(product.original_price, 0) || price * 1.5;

    if (original > price && price > 0) {
      return Math.max(1, Math.round(((original - price) / original) * 100));
    }

    return Math.max(10, Math.min(65, Math.round(safeNumber(product.discount_percentage, 18))));
  }

  function computeScore(product) {
    const reviews = safeNumber(product.amazon_review_count, 0);
    const rating = safeNumber(product.amazon_rating, 0);
    const discount = safeNumber(product.discount_percentage, 20);
    const priority = safeNumber(product.priority, 0);
    const sourceBonus = String(product.source_kind || "").toLowerCase() === "deal" ? 120 : 0;

    return (
      reviews * 0.4 +
      rating * 100 * 0.3 +
      discount * 10 * 0.2 +
      priority * 4 +
      sourceBonus
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
          alt="${escapeHtml(product.name || "Product")}"
          class="h-40 w-full rounded-xl bg-white object-contain"
          loading="lazy"
          onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
        />
        <div class="mt-3 text-xs font-semibold text-green-400">${escapeHtml(hook)}</div>
        <h3 class="mt-2 text-sm font-semibold text-white">${escapeHtml(product.name || "Product")}</h3>
        <div class="mt-2 text-xs text-zinc-400">⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})</div>
        <div class="mt-2 font-bold text-green-400">$${price.toFixed(2)}</div>
      </a>
    `;
  }

  try {
    let query = window.supabaseClient
      .from("products")
      .select("*")
      .limit(1);

    const rawValue = identifier.value;
    const looksLikeAsin = /^[A-Z0-9]{10}$/i.test(rawValue);

    if (identifier.mode === "slug") {
      query = query.eq("slug", rawValue);
    } else if (identifier.mode === "asin") {
      query = query.eq("asin", rawValue.toUpperCase());
    } else {
      query = looksLikeAsin
        ? query.eq("asin", rawValue.toUpperCase())
        : query.eq("slug", rawValue);
    }

    const { data, error } = await query;

    if (error || !data || !data.length) {
      console.error("Product not found", error);
      return;
    }

    const product = data[0];
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
    const discount = getDiscount(product);

    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Frequently bought";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";
    const productType = window.ProductHooks ? window.ProductHooks.inferProductType(product) : "generic";

    const canonicalUrl = product.slug
      ? `https://www.trend-pulse.shop/product/${encodeURIComponent(product.slug)}`
      : `https://www.trend-pulse.shop/product/${encodeURIComponent(product.asin || "")}`;

    const elTitle = document.getElementById("product-title");
    const elImage = document.getElementById("product-image");
    const elPrice = document.getElementById("product-price");
    const elOriginalPrice = document.getElementById("product-original-price");
    const elDesc = document.getElementById("product-description");
    const elRating = document.getElementById("product-rating");
    const elCategory = document.getElementById("product-category");
    const elBuy = document.getElementById("product-buy-link");
    const elBreadcrumb = document.getElementById("product-breadcrumb");
    const relatedProductsEl = document.getElementById("related-products");
    const relatedCategoriesEl = document.getElementById("related-product-categories");
    const elHook = document.getElementById("product-hook");
    const elUrgency = document.getElementById("product-urgency");
    const elProof = document.getElementById("product-proof");
    const elDiscountBadge = document.getElementById("product-discount-badge");
    const elProofBadge = document.getElementById("product-proof-badge");
    const elPriceStory = document.getElementById("product-price-story");
    const elSourceBadge = document.getElementById("product-source-badge");
    const elWhyText = document.getElementById("product-why-text");
    const elValueBox = document.getElementById("product-value-box");
    const elDemandBox = document.getElementById("product-demand-box");
    const elTypeBox = document.getElementById("product-type-box");

    if (elTitle) elTitle.textContent = title;
    if (elImage) {
      elImage.src = image;
      elImage.alt = title;
    }
    if (elPrice) elPrice.textContent = `$${price.toFixed(2)}`;
    if (elOriginalPrice) elOriginalPrice.textContent = `$${originalPrice.toFixed(2)}`;
    if (elDesc) elDesc.textContent = description;
    if (elRating) {
      elRating.textContent = `⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})`;
    }
    if (elCategory) elCategory.textContent = capitalize(category);
    if (elBuy) elBuy.href = product.affiliate_link || product.amazon_url || "#";
    if (elBreadcrumb) elBreadcrumb.textContent = title;
    if (elHook) elHook.textContent = hook;
    if (elUrgency) elUrgency.textContent = `⚡ ${urgency}`;
    if (elProof) elProof.textContent = proof;
    if (elProofBadge) elProofBadge.textContent = proof;
    if (elPriceStory) elPriceStory.textContent = priceStory;
    if (elValueBox) elValueBox.textContent = priceStory;
    if (elDemandBox) elDemandBox.textContent = proof;
    if (elTypeBox) elTypeBox.textContent = capitalize(productType);

    if (elDiscountBadge) {
      elDiscountBadge.textContent = `-${discount}%`;
      elDiscountBadge.classList.remove("hidden");
    }

    if (elSourceBadge && String(product.source_kind || "").toLowerCase() === "deal") {
      elSourceBadge.classList.remove("hidden");
      elSourceBadge.textContent = "Deal";
    }

    if (elWhyText) {
      elWhyText.textContent =
        `${title} is featured because it shows strong demand signals on Amazon, with a combination of buyer interest, ratings, reviews, and pricing value that makes it worth surfacing on TrendPulse.`;
    }

    document.title = `${title} | TrendPulse`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", canonicalUrl);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${title} | TrendPulse`);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", description);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonicalUrl);

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute("content", image);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", `${title} | TrendPulse`);

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", description);

    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) twitterImage.setAttribute("content", image);

    const schema = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: title,
      image: [image],
      description,
      sku: product.asin || undefined,
      brand: product.brand
        ? {
            "@type": "Brand",
            name: product.brand
          }
        : undefined,
      aggregateRating:
        rating > 0
          ? {
              "@type": "AggregateRating",
              ratingValue: String(rating),
              reviewCount: String(reviews)
            }
          : undefined,
      offers: {
        "@type": "Offer",
        priceCurrency: product.currency || "USD",
        price: String(price),
        availability: "https://schema.org/InStock",
        url: product.affiliate_link || product.amazon_url || canonicalUrl
      }
    };

    const existingSchema = document.getElementById("product-schema");
    if (existingSchema) existingSchema.remove();

    const script = document.createElement("script");
    script.id = "product-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

    const { data: relatedProducts, error: relatedError } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", category)
      .neq("asin", product.asin)
      .limit(24);

    if (relatedError) {
      console.error("Related products error:", relatedError);
    }

    const dedupedRelated = [];
    const seen = new Set();

    for (const item of relatedProducts || []) {
      const key = item.asin || item.slug || item.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      dedupedRelated.push({
        ...item,
        final_score: computeScore(item)
      });
    }

    dedupedRelated.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));

    if (relatedProductsEl) {
      relatedProductsEl.innerHTML = dedupedRelated.slice(0, 4).map(relatedCard).join("");
    }

    const relatedCategoryMap = {
      tech: ["home", "travel", "general", "fashion"],
      home: ["kitchen", "beauty", "general", "family"],
      kitchen: ["home", "health", "general", "beauty"],
      beauty: ["health", "fashion", "general", "home"],
      sports: ["health", "fashion", "general", "travel"],
      health: ["sports", "beauty", "general", "kitchen"],
      travel: ["tech", "fashion", "general", "home"],
      fashion: ["beauty", "tech", "general", "travel"],
      family: ["home", "health", "general", "fashion"],
      general: ["tech", "home", "beauty", "kitchen"]
    };

    const relatedCategories = relatedCategoryMap[category] || ["general"];

    if (relatedCategoriesEl) {
      relatedCategoriesEl.innerHTML = relatedCategories
        .map(
          (item) => `
            <a
              href="/catalog/${encodeURIComponent(item)}"
              class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            >
              ${escapeHtml(capitalize(item))}
            </a>
          `
        )
        .join("");
    }
  } catch (err) {
    console.error("Product page error:", err);
  }
});
