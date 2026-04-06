document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client not available");
    return;
  }

  function getProductIdentifierFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "product" && pathParts[1]) {
      return { mode: "path", value: decodeURIComponent(pathParts[1]) };
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("slug")) return { mode: "slug", value: params.get("slug") };
    if (params.get("asin")) return { mode: "asin", value: params.get("asin") };

    return null;
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
    if (!raw || raw.includes("placeholder")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  function capitalize(value) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function sanitizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const original = safeNumber(row?.original_price, 0);

    return {
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),
      asin: normalizeText(row?.asin),
      name: normalizeText(row?.name) || "Amazon Product",
      description: normalizeText(row?.description),
      category: normalizeText(row?.category) || "general",
      image: proxyImage(row?.image_url || row?.image),
      price,
      original_price: original > price ? original : price * 1.5,
      rating: safeNumber(row?.amazon_rating, 0),
      reviews: safeNumber(row?.amazon_review_count, 0),
      affiliate: normalizeText(row?.affiliate_link || row?.amazon_url || "#")
    };
  }

  function computeScore(p) {
    return (
      safeNumber(p.reviews) * 0.4 +
      safeNumber(p.rating) * 100 * 0.3
    );
  }

  function relatedCard(p) {
    return `
      <a href="/product/${encodeURIComponent(p.slug)}" class="block border border-zinc-800 p-3 rounded-xl hover:border-zinc-600">
        <img src="${p.image}" class="h-32 w-full object-contain bg-white rounded" />
        <h3 class="mt-2 text-sm">${p.name}</h3>
        <p class="text-green-400 font-bold">$${p.price.toFixed(2)}</p>
      </a>
    `;
  }

  try {
    const identifier = getProductIdentifierFromURL();
    if (!identifier?.value) return;

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .or(`slug.eq.${identifier.value},asin.eq.${identifier.value}`)
      .limit(1);

    if (error || !data || !data.length) {
      console.error("Product not found");
      return;
    }

    const product = sanitizeProduct(data[0]);

    // --- UI ---
    document.getElementById("product-title").textContent = product.name;
    document.getElementById("product-image").src = product.image;
    document.getElementById("product-price").textContent = `$${product.price.toFixed(2)}`;
    document.getElementById("product-original-price").textContent = `$${product.original_price.toFixed(2)}`;
    document.getElementById("product-description").textContent = product.description;
    document.getElementById("product-rating").textContent =
      `⭐ ${product.rating.toFixed(1)} (${product.reviews})`;
    document.getElementById("product-category").textContent =
      capitalize(product.category);

    document.getElementById("product-buy-link").href = product.affiliate;

    document.title = `${product.name} | TrendPulse`;

    // --- RELATED ---
    const { data: related } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", product.category)
      .limit(10);

    if (related) {
      const items = related
        .map(sanitizeProduct)
        .filter(p => p.slug !== product.slug)
        .map(p => ({ ...p, score: computeScore(p) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      document.getElementById("related-products").innerHTML =
        items.map(relatedCard).join("");
    }

  } catch (err) {
    console.error("Product page error:", err);
  }
});
