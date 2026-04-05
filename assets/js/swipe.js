document.addEventListener("DOMContentLoaded", async () => {
  if (!window.TrendPulseUI) {
    console.error("TrendPulseUI missing");
    return;
  }

  const stack = document.getElementById("swipe-stack");
  const emptyState = document.getElementById("swipe-empty-state");
  const dislikeBtn = document.getElementById("swipe-dislike-btn");
  const likeBtn = document.getElementById("swipe-like-btn");
  const resetBtn = document.getElementById("reset-disliked-deals");

  if (!stack) return;

  const STORAGE_KEY = "trendpulse_disliked_v7";

  let products = [];
  let currentIndex = 0;
  let autoAdvanceTimer = null;

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
    if (!id) return;
    const list = getDisliked();
    if (!list.includes(id)) {
      list.push(id);
      setDisliked(list);
    }
  }

  function resetDisliked() {
    localStorage.removeItem(STORAGE_KEY);
  }

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

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url = "") {
    const raw = String(url || "").trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/700x700?text=No+Image";
    }
    return raw;
  }

  function vibrate() {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  function getKey(product) {
    return (
      String(product?.asin || "").trim() ||
      String(product?.slug || "").trim() ||
      String(product?.id || "").trim() ||
      String(product?.name || "").trim()
    );
  }

  function currentProduct() {
    return products[currentIndex] || null;
  }

  function nextProduct(offset = 1) {
    return products[currentIndex + offset] || null;
  }

  function setEmptyState(isEmpty) {
    if (!emptyState) return;
    emptyState.classList.toggle("hidden", !isEmpty);
  }

  function getDiscount(product) {
    return window.TrendPulseUI?.getDiscount
      ? window.TrendPulseUI.getDiscount(product)
      : 20;
  }

  function buildCard(product, depth = 0) {
    if (!product) return "";

    const image = proxyImage(product.image_url);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = safeNumber(product.price, 0);
    const originalPrice = safeNumber(product.original_price, 0) || price * 1.5;
    const depthClass =
      depth === 0
        ? "z-30 scale-100 opacity-100"
        : depth === 1
          ? "z-20 scale-[0.97] translate-y-3 opacity-70"
          : "z-10 scale-[0.94] translate-y-6 opacity-40";

    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Popular pick";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";
    const discount = getDiscount(product);

    return `
      <article
        class="swipe-card ${depthClass} absolute inset-0 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30 transition duration-300 select-none"
        data-depth="${depth}"
      >
        <div class="relative h-full">
          <div class="absolute left-4 top-4 z-20 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
            -${discount}%
          </div>

          <div class="absolute right-4 top-4 z-20 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            🔥 ${escapeHtml(proof)}
          </div>

          <div class="swipe-like-badge absolute right-4 top-14 z-20 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-black opacity-0 transition">
            LIKE
          </div>

          <div class="swipe-dislike-badge absolute left-4 top-14 z-20 rounded-full border border-red-400 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300 opacity-0 transition">
            NOPE
          </div>

          <div class="relative h-[56%] overflow-hidden bg-white">
            <img
              src="${image}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-full w-full object-contain"
              loading="lazy"
              draggable="false"
              onerror="this.src='https://via.placeholder.com/700x700?text=No+Image'"
            />
          </div>

          <div class="flex h-[44%] flex-col bg-zinc-950 p-5">
            <div class="text-xs font-semibold text-green-400">
              ${escapeHtml(hook)}
            </div>

            <div class="mt-2 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-300">
                  ${escapeHtml(product.category || "general")}
                </div>

                <h2 class="mt-3 text-2xl font-bold leading-tight text-white">
                  ${escapeHtml(product.name || "Product")}
                </h2>
              </div>

              <div class="shrink-0 text-right">
                <div class="text-3xl font-bold text-green-400">${formatPrice(price)}</div>
                <div class="mt-1 text-xs text-zinc-500 line-through">${formatPrice(originalPrice)}</div>
              </div>
            </div>

            <ul class="mt-4 space-y-2 text-sm text-zinc-300">
              <li>⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})</li>
              <li>⚡ ${escapeHtml(urgency)}</li>
              <li>${escapeHtml(priceStory)}</li>
            </ul>

            <div class="mt-auto flex gap-3 pt-5">
              <button
                type="button"
                class="swipe-dislike-action inline-flex flex-1 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300"
              >
                Dislike
              </button>

              <a
                href="${escapeHtml(window.TrendPulseUI.amazonLink(product))}"
                target="_blank"
                rel="nofollow sponsored noopener"
                class="swipe-buy-action inline-flex flex-1 items-center justify-center rounded-full bg-green-500 px-4 py-3 text-sm font-semibold text-black"
              >
                Buy on Amazon
              </a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function preloadUpcomingImages() {
    for (let i = 1; i <= 3; i += 1) {
      const product = nextProduct(i);
      if (product?.image_url) {
        const img = new Image();
        img.src = proxyImage(product.image_url);
      }
    }
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  }

  function scheduleAutoAdvance() {
    clearAutoAdvance();
    autoAdvanceTimer = setTimeout(() => {
      if (products.length > 0) {
        advance();
      }
    }, 7000);
  }

  function renderStack() {
    const first = currentProduct();
    const second = nextProduct(1);
    const third = nextProduct(2);

    if (!first) {
      stack.innerHTML = "";
      setEmptyState(true);
      clearAutoAdvance();
      return;
    }

    setEmptyState(false);

    stack.innerHTML = `
      ${buildCard(third, 2)}
      ${buildCard(second, 1)}
      ${buildCard(first, 0)}
    `;

    const topCard = stack.querySelector('.swipe-card[data-depth="0"]');
    const dislikeAction = stack.querySelector(".swipe-dislike-action");
    const buyAction = stack.querySelector(".swipe-buy-action");

    attachSwipe(topCard, first);

    dislikeAction?.addEventListener("click", (e) => {
      e.preventDefault();
      dislikeCurrent();
    });

    buyAction?.addEventListener("click", () => {
      clearAutoAdvance();
      setTimeout(() => {
        advance();
      }, 120);
    });

    preloadUpcomingImages();
    scheduleAutoAdvance();
  }

  function advance() {
    vibrate();
    currentIndex += 1;

    if (currentIndex >= products.length) {
      currentIndex = 0;
    }

    renderStack();
  }

  function dislikeCurrent() {
    const product = currentProduct();
    if (!product) return;
    addDisliked(getKey(product));
    advance();
  }

  function openAmazon(product) {
    if (!product) return;
    window.open(window.TrendPulseUI.amazonLink(product), "_blank", "noopener,noreferrer");
  }

  function commitRight(card, product) {
    clearAutoAdvance();
    card.style.transition = "transform 220ms ease, opacity 220ms ease";
    card.style.transform = "translateX(120%) rotate(14deg)";
    card.style.opacity = "0";

    setTimeout(() => {
      vibrate();
      openAmazon(product);
      advance();
    }, 220);
  }

  function commitLeft(card, product) {
    clearAutoAdvance();
    card.style.transition = "transform 220ms ease, opacity 220ms ease";
    card.style.transform = "translateX(-120%) rotate(-14deg)";
    card.style.opacity = "0";

    setTimeout(() => {
      addDisliked(getKey(product));
      vibrate();
      advance();
    }, 220);
  }

  function attachSwipe(card, product) {
    if (!card || !product) return;

    const likeBadge = card.querySelector(".swipe-like-badge");
    const dislikeBadge = card.querySelector(".swipe-dislike-badge");

    let startX = 0;
    let currentX = 0;
    let dragging = false;

    function updateVisuals(deltaX) {
      const rotation = deltaX / 18;
      const scale = 1 - Math.min(Math.abs(deltaX) / 1600, 0.03);

      card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg) scale(${scale})`;

      const likeOpacity = Math.min(Math.max(deltaX / 140, 0), 1);
      const dislikeOpacity = Math.min(Math.max(-deltaX / 140, 0), 1);

      if (likeBadge) likeBadge.style.opacity = String(likeOpacity);
      if (dislikeBadge) dislikeBadge.style.opacity = String(dislikeOpacity);
    }

    function resetCard() {
      card.style.transition = "transform 180ms ease";
      card.style.transform = "";
      if (likeBadge) likeBadge.style.opacity = "0";
      if (dislikeBadge) dislikeBadge.style.opacity = "0";
      scheduleAutoAdvance();
    }

    function onStart(clientX) {
      clearAutoAdvance();
      dragging = true;
      startX = clientX;
      currentX = 0;
      card.style.transition = "none";
    }

    function onMove(clientX) {
      if (!dragging) return;
      currentX = clientX - startX;
      updateVisuals(currentX);
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;

      if (currentX > 110) {
        commitRight(card, product);
      } else if (currentX < -110) {
        commitLeft(card, product);
      } else {
        resetCard();
      }
    }

    card.addEventListener("touchstart", (e) => onStart(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX), { passive: true });
    card.addEventListener("touchend", () => onEnd(), { passive: true });

    card.addEventListener("mousedown", (e) => {
      onStart(e.clientX);

      function moveHandler(ev) {
        onMove(ev.clientX);
      }

      function upHandler() {
        document.removeEventListener("mousemove", moveHandler);
        document.removeEventListener("mouseup", upHandler);
        onEnd();
      }

      document.addEventListener("mousemove", moveHandler);
      document.addEventListener("mouseup", upHandler);
    });
  }

  async function init() {
    const allProducts = await window.TrendPulseUI.fetchProducts();
    const disliked = getDisliked();

    products = allProducts.filter((p) => !disliked.includes(getKey(p)));

    if (!products.length) {
      products = allProducts;
    }

    currentIndex = 0;
    renderStack();
  }

  dislikeBtn?.addEventListener("click", () => {
    dislikeCurrent();
  });

  likeBtn?.addEventListener("click", () => {
    const product = currentProduct();
    if (!product) return;
    clearAutoAdvance();
    vibrate();
    openAmazon(product);
    advance();
  });

  resetBtn?.addEventListener("click", async () => {
    resetDisliked();
    await init();
  });

  await init();
});
