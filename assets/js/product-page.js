// assets/js/product-page.js

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client is not available.");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const slugParam = params.get("slug");
  const asinParam = params.get("asin");

  const titleEl = document.getElementById("product-title");
  if (!titleEl) return;

  const els = {
    breadcrumbCategory: document.getElementById("product-breadcrumb-category"),
    breadcrumbName: document.getElementById("product-breadcrumb-name"),
    badge: document.getElementById("product-badge"),
    categoryPill: document.getElementById("product-category-pill"),
    brandPill: document.getElementById("product-brand-pill"),
    rating: document.getElementById("product-rating"),
    reviewCount: document.getElementById("product-review-count"),
    categoryInline: document.getElementById("product-category-inline"),
    shortDescription: document.getElementById("product-short-description"),
    price: document.getElementById("product-price"),
    originalPrice: document.getElementById("product-original-price"),
    discount: document.getElementById("product-discount"),
    priceCard: document.getElementById("product-price-card"),
    ratingCard: document.getElementById("product-rating-card"),
    reviewsCard: document.getElementById("product-reviews-card"),
    buyButton: document.getElementById("product-buy-button"),
    stickyBuyButton: document.getElementById("sticky-product-buy-button"),
    categoryLink: document.getElementById("product-category-link"),
    relatedCategoryLink: document.getElementById("related-category-link"),
    quickPoints: document.getElementById("product-quick-points"),
    description: document.getElementById("product-description"),
    stickyTitle: document.getElementById("sticky-product-title"),
    stickyPrice: document.getElementById("sticky-product-price"),
    mainImage: document.getElementById("product-main-image"),
    relatedGrid: document.getElementById("related-products-grid")
  };

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function capitalize(value = "") {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function ensureAffiliateTag(url) {
    const affiliateTag =
      (window.TRENDPULSE_CONFIG && window.TRENDPULSE_CONFIG.affiliateTag) || "Drackk-20";

    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("amazon")) {
        parsed.searchParams.set("tag", affiliateTag);
      }
      return parsed.toString();
    } catch {
      return url || "#";
    }
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      return `https://images.weserv.nl/?url=${encodeURIComponent(
        parsed.host + parsed.pathname + parsed.search
      )}&w=1400&h=1400&fit=contain&bg=ffffff&output=jpg`;
    } catch {
      return "";
    }
  }

  function initialsFromTitle(title = "") {
    const words = String(title).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "TP";
    return words.map((w) => w[0]).join("").toUpperCase();
  }

  function buildPlaceholder(product) {
    const title = String(product.name || "Product");
    const badge = product.is_best_seller
      ? "Best Seller"
      : product.is_giftable
      ? "Giftable"
      : product.is_crazy_deal
      ? "Hot Deal"
      : "Product";

    const price = formatPrice(product.price || 0);
    const initials = initialsFromTitle(title);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#18181b"/>
            <stop offset="100%" stop-color="#3f3f46"/>
          </linearGradient>
        </defs>
        <rect width="800" height="800" fill="url(#g)"/>
        <circle cx="660" cy="140" r="110" fill="#ffffff" opacity="0.07"/>
        <circle cx="130" cy="670" r="150" fill="#ffffff" opacity="0.05"/>
        <rect x="42" y="42" rx="24" ry="24" width="190" height="58" fill="#09090b" opacity="0.95"/>
        <text x="137" y="79" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${escapeHtml(
          badge
        )}</text>
        <text x="400" y="355" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="800" fill="#ffffff" opacity="0.12">${escapeHtml(
          initials
        )}</text>
        <text x="50" y="560" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(0, 24)
        )}</text>
        <text x="50" y="622" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(24, 48)
        )}</text>
        <rect x="42" y="690" rx="24" ry="24" width="190" height="70" fill="#09090b" opacity="0.95"/>
        <text x="137" y="736" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#22c55e">${escapeHtml(
          price
        )}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function buildQuickPoints(product) {
    const points = [];

    if (product.short_description) points.push(product.short_description);
    if (safeNumber(product.amazon_rating) > 0) points.push(`Rated ${product.amazon_rating}/5 on Amazon`);
    if (safeNumber(product.amazon_review_count) > 0) {
      points.push(`${product.amazon_review_count.toLocaleString()} Amazon reviews`);
    }
    if (safeNumber(product.discount_percentage) > 0) {
      points.push(`${product.discount_percentage}% off vs regular price`);
    }
    if (product.brand) points.push(`Brand: ${product.brand}`);

    return points.slice(0, 4);
  }

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setHref(el, value) {
    if (el) el.href = value;
  }

  function renderImage(product) {
    if (!els.mainImage) return;

    const imageUrl = proxyImage(product.image_url || product.image || "");
    const placeholder = buildPlaceholder(product);

    els.mainImage.innerHTML = `
      <div class="relative h-full w-full overflow-hidden bg-white">
        <img
          src="${placeholder}"
          alt="${escapeHtml(product.name || "Product")}"
          class="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        ${
          imageUrl
            ? `
          <img
            src="${imageUrl}"
            alt="${escapeHtml(product.name || "Product")}"
            class="relative z-10 h-full w-full object-contain"
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.remove()"
          />
        `
            : ""
        }
      </div>
    `;
  }

  function productCard(product) {
    const proxied = proxyImage(product.image_url || product.image || "");
    const placeholder = buildPlaceholder(product);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = formatPrice(product.price);
    const productUrl = product.slug
      ? `/product.html?slug=${encodeURIComponent(product.slug)}`
      : `/product.html?asin=${encodeURIComponent(product.asin || "")}`;

    return `
      <article class="group overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${productUrl}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${placeholder}"
              alt="${escapeHtml(product.name || "Product")}"
              class="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            ${
              proxied
                ? `
              <img
                src="${proxied}"
                alt="${escapeHtml(product.name || "Product")}"
                class="relative z-10 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.remove()"
              />
            `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <span class="text-lg font-bold text-green-400">${price}</span>
              <span class="text-xs font-bold text-zinc-300">View →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  async function loadProduct() {
    let query = window.supabaseClient.from("products").select("*").eq("is_active", true);

    if (slugParam) {
      query = query.eq("slug", slugParam).limit(1).maybeSingle();
    } else if (asinParam) {
      query = query.eq("asin", asinParam).limit(1).maybeSingle();
    } else {
      return null;
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return null;
    }

    return data || null;
  }

  async function loadRelated(category, currentId) {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("type", "catalog")
      .eq("is_active", true)
      .eq("category", category)
      .neq("id", currentId)
      .order("priority", { ascending: false })
      .order("amazon_review_count", { ascending: false })
      .order("amazon_rating", { ascending: false })
      .limit(8);

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  async function trackView(productId) {
    try {
      await window.supabaseClient.rpc("increment_product_views", {
        product_id: productId
      });
    } catch {}
  }

  async function trackClick(productId) {
    try {
      await window.supabaseClient.rpc("increment_product_clicks", {
        product_id: productId
      });
    } catch {}
  }

  const product = await loadProduct();

  if (!product) {
    titleEl.textContent = "Product not found";
    if (els.description) {
      els.description.textContent =
        "This product is unavailable or no longer active.";
    }
    return;
  }

  const categoryName = capitalize(normalize(product.category || "catalog"));
  const affiliateLink = ensureAffiliateTag(
    product.affiliate_link || product.amazon_url || "#"
  );
  const ratingValue = safeNumber(product.amazon_rating, 0);
  const reviewCountValue = safeNumber(product.amazon_review_count, 0);
  const discountValue = safeNumber(product.discount_percentage, 0);
  const quickPoints = buildQuickPoints(product);

  document.title = `${product.name} | TrendPulse`;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute(
      "content",
      product.short_description ||
        product.description ||
        "Browse detailed Amazon product information on TrendPulse."
    );
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    const canonicalUrl = product.slug
      ? `https://www.trend-pulse.shop/product.html?slug=${encodeURIComponent(product.slug)}`
      : `https://www.trend-pulse.shop/product.html?asin=${encodeURIComponent(product.asin || "")}`;
    canonical.setAttribute("href", canonicalUrl);
  }

  setText(titleEl, product.name || "Product");
  setText(els.breadcrumbName, product.name || "Product");
  setText(els.breadcrumbCategory, categoryName);
  setText(els.badge, product.is_best_seller ? "Best Seller" : product.is_giftable ? "Giftable Pick" : "Product");
  setText(els.categoryPill, categoryName);
  setText(els.brandPill, product.brand || "Amazon");
  setText(els.rating, ratingValue > 0 ? `${ratingValue.toFixed(1)} / 5` : "—");
  setText(els.reviewCount, reviewCountValue.toLocaleString());
  setText(els.categoryInline, categoryName);
  setText(
    els.shortDescription,
    product.short_description || product.description || "Amazon product selected by TrendPulse."
  );
  setText(els.price, formatPrice(product.price));
  setText(els.priceCard, formatPrice(product.price));
  setText(els.ratingCard, ratingValue > 0 ? ratingValue.toFixed(1) : "—");
  setText(els.reviewsCard, reviewCountValue.toLocaleString());
  setText(
    els.description,
    product.description || product.short_description || "No detailed description available."
  );
  setText(els.stickyTitle, product.name || "Product");
  setText(els.stickyPrice, formatPrice(product.price));

  if (product.original_price && safeNumber(product.original_price) > safeNumber(product.price)) {
    setText(els.originalPrice, formatPrice(product.original_price));
    els.originalPrice?.classList.remove("hidden");
  }

  if (discountValue > 0) {
    setText(els.discount, `${discountValue}% off`);
    els.discount?.classList.remove("hidden");
  }

  if (els.quickPoints) {
    els.quickPoints.innerHTML = quickPoints
      .map((point) => `<li>${escapeHtml(point)}</li>`)
      .join("");
  }

  setHref(els.buyButton, affiliateLink);
  setHref(els.stickyBuyButton, affiliateLink);
  setHref(els.categoryLink, `/catalog-category.html?category=${encodeURIComponent(product.category || "tech")}`);
  setHref(els.relatedCategoryLink, `/catalog-category.html?category=${encodeURIComponent(product.category || "tech")}`);

  renderImage(product);

  const clickTargets = [els.buyButton, els.stickyBuyButton];
  clickTargets.forEach((el) => {
    if (!el) return;
    el.addEventListener("click", () => {
      trackClick(product.id);
    });
  });

  const related = await loadRelated(product.category, product.id);
  if (els.relatedGrid) {
    els.relatedGrid.innerHTML = related.map(productCard).join("");
  }

  await trackView(product.id);
});
