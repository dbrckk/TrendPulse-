// assets/js/swipe.js

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client missing");
    return;
  }

  const stack = document.getElementById("swipe-stack");
  const emptyState = document.getElementById("swipe-empty-state");
  const dislikeBtn = document.getElementById("swipe-dislike-btn");
  const likeBtn = document.getElementById("swipe-like-btn");
  const resetBtn = document.getElementById("reset-disliked-deals");

  let products = [];
  let index = 0;

  const STORAGE_KEY = "trendpulse_disliked";

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
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function proxyImage(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      return `https://images.weserv.nl/?url=${encodeURIComponent(
        parsed.host + parsed.pathname
      )}&w=800&h=800&fit=contain`;
    } catch {
      return "";
    }
  }

  function buildCard(p) {
    const img = proxyImage(p.image_url || p.image || "");

    return `
      <div class="swipe-card absolute inset-0 rounded-3xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-xl">
        <div class="h-[65%] bg-white flex items-center justify-center">
          <img src="${img}" class="max-h-full object-contain" />
        </div>

        <div class="p-4">
          <h2 class="text-lg font-bold text-white line-clamp-2">
            ${escapeHtml(p.name)}
          </h2>

          <div class="mt-2 text-sm text-zinc-400">
            ⭐ ${p.amazon_rating || "—"} (${p.amazon_review_count || 0})
          </div>

          <div class="mt-3 flex justify-between items-center">
            <span class="text-green-400 text-xl font-bold">
              $${Number(p.price || 0).toFixed(2)}
            </span>

            <span class="text-xs text-zinc-500">
              Swipe →
            </span>
          </div>
        </div>
      </div>
    `;
  }

  async function fetchDeals() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("type", "deal")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  function renderStack() {
    if (!stack) return;

    stack.innerHTML = "";

    const current = products[index];

    if (!current) {
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");

    stack.innerHTML = buildCard(current);

    attachSwipe(stack.firstElementChild);
  }

  function next() {
    index++;
    renderStack();
  }

  function openAmazon(p) {
    const url = p.affiliate_link || p.amazon_url || "#";
    window.open(url, "_blank");
  }

  function attachSwipe(card) {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    card.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    });

    card.addEventListener("touchmove", (e) => {
      if (!isDragging) return;

      currentX = e.touches[0].clientX - startX;

      card.style.transform = `translateX(${currentX}px) rotate(${currentX / 10}deg)`;
    });

    card.addEventListener("touchend", () => {
      isDragging = false;

      if (currentX > 120) {
        openAmazon(products[index]);
        next();
      } else if (currentX < -120) {
        addDisliked(products[index].id);
        next();
      } else {
        card.style.transform = "";
      }
    });
  }

  dislikeBtn?.addEventListener("click", () => {
    addDisliked(products[index].id);
    next();
  });

  likeBtn?.addEventListener("click", () => {
    openAmazon(products[index]);
    next();
  });

  resetBtn?.addEventListener("click", () => {
    resetDisliked();
    init();
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
