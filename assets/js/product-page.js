document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client not available");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const asin = params.get("asin");
  const slug = params.get("slug");

  if (!asin && !slug) return;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function proxyImage(url = "") {
    const raw = String(url).trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  try {
    let query = window.supabaseClient
      .from("products")
      .select("*")
      .limit(1);

    if (slug) {
      query = query.eq("slug", slug);
    } else {
      query = query.eq("asin", asin);
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
    const rating = safeNumber(product.amazon_rating);
    const reviews = safeNumber(product.amazon_review_count);

    const url = product.slug
      ? `https://www.trend-pulse.shop/product.html?slug=${encodeURIComponent(product.slug)}`
      : `https://www.trend-pulse.shop/product.html?asin=${encodeURIComponent(product.asin || "")}`;

    // DOM elements
    const elTitle = document.getElementById("product-title");
    const elImage = document.getElementById("product-image");
    const elPrice = document.getElementById("product-price");
    const elDesc = document.getElementById("product-description");
    const elRating = document.getElementById("product-rating");
    const elCategory = document.getElementById("product-category");
    const elBuy = document.getElementById("product-buy-link");
    const elBreadcrumb = document.getElementById("product-breadcrumb");

    // Inject content
    if (elTitle) elTitle.textContent = title;
    if (elImage) {
      elImage.src = image;
      elImage.alt = title;
    }

    if (elPrice) elPrice.textContent = `$${price.toFixed(2)}`;
    if (elDesc) elDesc.textContent = description;

    if (elRating) {
      elRating.textContent = `⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})`;
    }

    if (elCategory) elCategory.textContent = product.category || "General";
    if (elBuy) elBuy.href = product.affiliate_link || product.amazon_url || "#";
    if (elBreadcrumb) elBreadcrumb.textContent = title;

    // =====================
    // SEO META
    // =====================

    document.title = `${title} | TrendPulse`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", url);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${title} | TrendPulse`);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", description);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute("content", image);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", `${title} | TrendPulse`);

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", description);

    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage) twitterImage.setAttribute("content", image);

    // =====================
    // SCHEMA PRODUCT (SEO ++)
    // =====================

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
        url: product.affiliate_link || product.amazon_url || url
      }
    };

    const existingSchema = document.getElementById("product-schema");
    if (existingSchema) existingSchema.remove();

    const script = document.createElement("script");
    script.id = "product-schema";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);

  } catch (err) {
    console.error("Product page error:", err);
  }
});
