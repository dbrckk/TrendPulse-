document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) return;

  const params = new URLSearchParams(window.location.search);
  const asin = params.get("asin");
  const slug = params.get("slug");

  let query = window.supabaseClient.from("products").select("*").limit(1);

  if (slug) {
    query = query.eq("slug", slug);
  } else if (asin) {
    query = query.eq("asin", asin);
  } else {
    return;
  }

  const { data, error } = await query;

  if (error || !data || !data.length) {
    return;
  }

  const product = data[0];

  const title = product.name || "Amazon Product";
  const description =
    product.short_description ||
    product.description ||
    `Browse ${title} on TrendPulse.`;
  const image =
    product.image_url || "https://via.placeholder.com/700x700?text=No+Image";
  const url = `https://www.trend-pulse.shop/product.html?asin=${encodeURIComponent(product.asin || "")}`;

  const productTitle = document.getElementById("product-title");
  const productImage = document.getElementById("product-image");
  const productPrice = document.getElementById("product-price");
  const productDescription = document.getElementById("product-description");
  const productRating = document.getElementById("product-rating");
  const productCategory = document.getElementById("product-category");
  const productBuyLink = document.getElementById("product-buy-link");
  const breadcrumb = document.getElementById("product-breadcrumb");

  if (productTitle) productTitle.textContent = title;
  if (productImage) {
    productImage.src = image;
    productImage.alt = title;
  }
  if (productPrice) productPrice.textContent = `$${Number(product.price || 0).toFixed(2)}`;
  if (productDescription) productDescription.textContent = description;
  if (productRating) {
    productRating.textContent = `⭐ ${product.amazon_rating || "—"} (${product.amazon_review_count || 0})`;
  }
  if (productCategory) productCategory.textContent = product.category || "General";
  if (productBuyLink) productBuyLink.href = product.affiliate_link || product.amazon_url || "#";
  if (breadcrumb) breadcrumb.textContent = title;

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
  if (twitterTitle) twitterTitle.setAttribute("content", `${title} | TrendPulse");

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
    brand: product.brand || undefined,
    sku: product.asin || undefined,
    aggregateRating: product.amazon_rating
      ? {
          "@type": "AggregateRating",
          ratingValue: String(product.amazon_rating),
          reviewCount: String(product.amazon_review_count || 0)
        }
      : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency || "USD",
      price: String(product.price || 0),
      availability: "https://schema.org/InStock",
      url: product.affiliate_link || product.amazon_url || url
    }
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
});
