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

  const STORAGE_KEY = "trendpulse_disliked_v4";

  let products = [];
  let index = 0;

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

  function escapeHtml(value = "") {
    return String(value)
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

  function currentProduct() {
    return products[index] || null;
  }

  function buildCard(product) {
    const image = product.image_url || "https://via.placeholder.com/600x600?text=No+Image";
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);

    return `
      <article class="swipe-card absolute inset-0 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30 select-none touch-pan-y">
        <div class="relative h-full">
          <div class="absolute left-4 top-4 z-20 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            ${escapeHtml(product.is_best_seller ? "Best Seller" : product.is_crazy_deal ? "Hot Deal" : "Deal")}
          </div>

          <div class="swipe-like-badge absolute right-4 top-4 z-20 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-black opacity-0 transition">
            LIKE
          </div>

          <div class="swipe-dislike-badge absolute left-4 top-14 z-20 rounded-full border border-red-400 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300 opacity-0 transition">
            NOPE
          </div>

          <div class="relative h-[58%] overflow-hidden bg-white">
            <img
              src="${image}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-full w-full object-contain"
              loading="lazy"
              draggable="false"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
          </div>

          <div class="flex h-[42%] flex-col bg-zinc-950 p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-300">
                  ${escapeHtml(product.category || "deal")}
                </div>
                <h2 class="mt-3 text-2xl font-bold leading-tight text-white">
                  ${escapeHtml(product.name || "Product")}
                </h2>
              </div>

              <div class="shrink-0 text-right">
                <div class="text-3xl font-bold text-green-400">${formatPrice(product.price)}</div>
                <div class="mt-1 text-xs text-zinc-500">Amazon deal</div>
              </div>
            </div>

            <ul class="mt-4 space-y-2 text-sm text-zinc-300">
              <li>⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})</li>
              <li>${product.discount_percentage > 0 ? `${product.discount_percentage}% off` : "Active deal"}</li>
              <li>${product.brand ? `Brand: ${escapeHtml(product.brand)}` : "Swipe or tap buttons below"}</li>
            </ul>

            <div class="mt-auto flex gap-3 pt-5">
              <button
                type="button"
                class="swipe-dislike-action inline-flex flex-1 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300"
              >
                Dislike
              </button>

              <a
                href="${escapeHtml(product.affiliate_link || "#")}"
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

  function setEmptyState(isEmpty) {
    if (!emptyState) return;
    if (isEmpty) {
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
    }
  }

  function nextCard() {
    index += 1;
    render();
  }

  function openAmazon(product) {
    if (!product) return;
    window.open(product.affiliate_link || "#", "_blank", "noopener,noreferrer");
  }

  function render() {
    const product = currentProduct();

    if (!product) {
      stack.innerHTML = "";
      setEmptyState(true);
      return;
    }

    setEmptyState(false);
    stack.innerHTML = buildCard(product);

    const card = stack.querySelector(".swipe-card");
    const dislikeAction = stack.querySelector(".swipe-dislike-action");
    const buyAction = stack.querySelector(".swipe-buy-action");

    attachSwipe(card, product);

    dislikeAction?.addEventListener("click", (e) => {
      e.preventDefault();
      addDisliked(product.id);
      nextCard();
    });

    buyAction?.addEventListener("click", () => {
      setTimeout(() => {
        nextCard();
      }, 120);
    });
  }

  function attachSwipe(card, product) {
    if (!card) return;

    const likeBadge = card.querySelector(".swipe-like-badge");
    const dislikeBadge = card.querySelector(".swipe-dislike-badge");

    let startX = 0;
    let currentX = 0;
    let dragging = false;

    function updateVisuals(deltaX) {
      const rotation = deltaX / 18;
      card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

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
    }

    function commitRight() {
      card.style.transition = "transform 220ms ease, opacity 220ms ease";
      card.style.transform = "translateX(120%) rotate(14deg)";
      card.style.opacity = "0";

      setTimeout(() => {
        openAmazon(product);
        nextCard();
      }, 220);
    }

    function commitLeft() {
      card.style.transition = "transform 220ms ease, opacity 220ms ease";
      card.style.transform = "translateX(-120%) rotate(-14deg)";
      card.style.opacity = "0";

      setTimeout(() => {
        addDisliked(product.id);
        nextCard();
      }, 220);
    }

    function onStart(clientX) {
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
        commitRight();
      } else if (currentX < -110) {
        commitLeft();
      } else {
        resetCard();
      }
    }

    card.addEventListener(
      "touchstart",
      (e) => {
        onStart(e.touches[0].clientX);
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

    card.addEventListener(
      "touchend",
      () => {
        onEnd();
      },
      { passive: true }
    );

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

    products = allProducts.filter((p) => !disliked.includes(p.id));
    index = 0;
    render();
  }

  dislikeBtn?.addEventListener("click", () => {
    const product = currentProduct();
    if (!product) return;
    addDisliked(product.id);
    nextCard();
  });

  likeBtn?.addEventListener("click", () => {
    const product = currentProduct();
    if (!product) return;
    openAmazon(product);
    nextCard();
  });

  resetBtn?.addEventListener("click", async () => {
    resetDisliked();
    await init();
  });

  await init();
});
