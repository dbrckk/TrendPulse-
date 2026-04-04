document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient || !window.TrendPulseUI) {
    console.error("Supabase or TrendPulseUI missing");
    return;
  }

  const stack = document.getElementById("swipe-stack");
  const emptyState = document.getElementById("swipe-empty-state");
  const dislikeBtn = document.getElementById("swipe-dislike-btn");
  const likeBtn = document.getElementById("swipe-like-btn");
  const resetBtn = document.getElementById("reset-disliked-deals");

  if (!stack) return;

  let products = [];
  let index = 0;

  const STORAGE_KEY = "trendpulse_disliked_v3";

  function getDisliked() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function setDisliked(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function addDisliked(id) {
    const list = getDisliked();
    if (!list.includes(id)) {
      list.push(id);
      setDisliked(list);
    }
  }

  function resetDisliked() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function escapeHtml(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function buildCard(product) {
    const proxied = window.TrendPulseUI.proxyImage(product.image_url || product.image || "");
    const placeholder = window.TrendPulseUI.buildPlaceholder(product);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);

    return `
      <article class="swipe-card absolute inset-0 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30">
        <div class="relative h-full">
          <div class="absolute left-4 top-4 z-20 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            ${escapeHtml(product.is_best_seller ? "Best Seller" : product.is_crazy_deal ? "Hot Deal" : "Deal")}
          </div>

          <div class="relative h-[58%] overflow-hidden bg-white">
            <img
              src="${placeholder}"
              alt="${escapeHtml(product.name || "Product")}"
              class="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <img
              src="${proxied}"
              alt="${escapeHtml(product.name || "Product")}"
              class="relative z-10 h-full w-full object-contain"
              loading="lazy"
              referrerpolicy="no-referrer"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
          </div>

          <div class="flex h-[42%] flex-col bg-zinc-950 p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-300">
                  ${escapeHtml(product.category || "deal")}
                </div>
                <h2 class="mt-3 text-2xl font-bold leading-tight text-white">
                  ${escapeHtml(product.name || "Product")}
                </h2>
              </div>

              <div class="text-right">
                <div class="text-3xl font-bold text-green-400">${formatPrice(product.price)}</div>
                <div class="mt-1 text-xs text-zinc-500">Amazon deal</div>
              </div>
            </div>

            <ul class="mt-4 space-y-2 text-sm text-zinc-300">
              <li>⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})</li>
              <li>${product.discount_percentage > 0 ? `${product.discount_percentage}% off` : "Active deal"}</li>
              <li>${product.brand ? `Brand: ${escapeHtml(product.brand)}` : "View full details"}</li>
            </ul>

            <div class="mt-auto flex gap-3 pt-5">
              <button
                type="button"
                class="swipe-dislike inline-flex flex-1 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300"
              >
                Dislike
              </button>

              <a
                href="${escapeHtml(product.affiliate_link || "#")}"
                target="_blank"
                rel="nofollow sponsored noopener"
                class="swipe-buy inline-flex flex-1 items-center justify-center rounded-full bg-green-500 px-4 py-3 text-sm font-semibold text-black"
              >
                Buy on Amazon
              </a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  async function fetchDeals() {
    const allProducts = await window.TrendPulseUI.fetchProducts();

    return allProducts
      .filter((p) => p.is_active !== false)
      .sort((a, b) => {
        if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
        return safeNumber(b.amazon_review_count, 0) - safeNumber(a.amazon_review_count, 0);
      });
  }

  async function trackRpc(fnName, productId) {
    try {
      await window.supabaseClient.rpc(fnName, { product_id: productId });
    } catch {
      // ignore
    }
  }

  function currentProduct() {
    return products[index] || null;
  }

  function renderStack() {
    const current = currentProduct();

    if (!current) {
      stack.innerHTML = "";
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");
    stack.innerHTML = buildCard(current);

    const card = stack.firstElementChild;
    attachSwipe(card);

    const dislikeAction = card.querySelector(".swipe-dislike");
    const buyAction = card.querySelector(".swipe-buy");

    dislikeAction?.addEventListener("click", (event) => {
      event.preventDefault();
      addDisliked(current.id);
      trackRpc("increment_product_swipe_left", current.id);
      next();
    });

    buyAction?.addEventListener("click", () => {
      trackRpc("increment_product_swipe_right", current.id);
      trackRpc("increment_product_clicks", current.id);
    });
  }

  function next() {
    index += 1;
    renderStack();
  }

  function openAmazon(product) {
    if (!product) return;
    trackRpc("increment_product_swipe_right", product.id);
    trackRpc("increment_product_clicks", product.id);
    window.open(product.affiliate_link || "#", "_blank", "noopener,noreferrer");
  }

  function attachSwipe(card) {
    if (!card) return;

    let startX = 0;
    let currentX = 0;
    let dragging = false;

    function onMove(clientX) {
      if (!dragging) return;
      currentX = clientX - startX;
      card.style.transition = "none";
      card.style.transform = `translateX(${currentX}px) rotate(${currentX / 15}deg)`;
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;

      const product = currentProduct();
      if (!product) return;

      if (currentX > 120) {
        card.style.transition = "transform 220ms ease, opacity 220ms ease";
        card.style.transform = "translateX(120%) rotate(14deg)";
        card.style.opacity = "0";

        setTimeout(() => {
          openAmazon(product);
          next();
        }, 220);
      } else if (currentX < -120) {
        card.style.transition = "transform 220ms ease, opacity 220ms ease";
        card.style.transform = "translateX(-120%) rotate(-14deg)";
        card.style.opacity = "0";

        setTimeout(() => {
          addDisliked(product.id);
          trackRpc("increment_product_swipe_left", product.id);
          next();
        }, 220);
      } else {
        card.style.transition = "transform 180ms ease";
        card.style.transform = "";
      }
    }

    card.addEventListener(
      "touchstart",
      (e) => {
        dragging = true;
        startX = e.touches[0].clientX;
        currentX = 0;
      },
      { passive: true }
    );

    card.addEventListener(
      "touchmove",
      (e) => {
        onMove(e.touches[0].clientX);
      },
      { passive: true }
    );

    card.addEventListener("touchend", onEnd, { passive: true });

    card.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      currentX = 0;

      const moveHandler = (moveEvent) => onMove(moveEvent.clientX);
      const upHandler = () => {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);
        onEnd();
      };

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    });
  }

  dislikeBtn?.addEventListener("click", () => {
    const product = currentProduct();
    if (!product) return;
    addDisliked(product.id);
    trackRpc("increment_product_swipe_left", product.id);
    next();
  });

  likeBtn?.addEventListener("click", () => {
    const product = currentProduct();
    if (!product) return;
    openAmazon(product);
    next();
  });

  resetBtn?.addEventListener("click", async () => {
    resetDisliked();
    await init();
  });

  async function init() {
    const disliked = getDisliked();
    const all = await fetchDeals();
    products = all.filter((p) => !disliked.includes(p.id));
    index = 0;
    renderStack();
  }

  await init();
});
