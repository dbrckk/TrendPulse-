document.addEventListener("DOMContentLoaded", async () => {
  if (!window.TrendPulseUI) return;

  const stack = document.getElementById("swipe-stack");
  if (!stack) return;

  const products = await window.TrendPulseUI.fetchProducts();
  let index = 0;

  function render() {
    const product = products[index];

    if (!product) {
      stack.innerHTML = "<div class='rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 text-center text-zinc-300'>No more deals right now.</div>";
      return;
    }

    stack.innerHTML = `
      <div class="rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
        <img src="${product.image_url || "https://via.placeholder.com/600x600?text=No+Image"}" class="w-full h-72 object-contain bg-white rounded-2xl" onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"/>
        <h2 class="mt-4 text-xl font-bold">${product.name || "Product"}</h2>
        <div class="mt-2 text-green-400 text-2xl font-bold">$${Number(product.price || 0).toFixed(2)}</div>
        <a href="${product.affiliate_link || product.amazon_url || "#"}" target="_blank" class="mt-4 block rounded-full bg-green-500 px-4 py-3 text-center font-semibold text-black">
          Buy on Amazon
        </a>
      </div>
    `;
  }

  document.getElementById("swipe-like-btn")?.addEventListener("click", () => {
    index += 1;
    render();
  });

  document.getElementById("swipe-dislike-btn")?.addEventListener("click", () => {
    index += 1;
    render();
  });

  render();
});
