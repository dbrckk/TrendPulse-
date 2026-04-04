document.addEventListener("DOMContentLoaded", async () => {
  if (!window.TrendPulseUI) return;

  const stack = document.getElementById("swipe-stack");

  if (!stack) return;

  const products = await window.TrendPulseUI.fetchProducts();

  let i = 0;

  function render() {
    if (!products[i]) {
      stack.innerHTML = "<p>No more deals</p>";
      return;
    }

    const p = products[i];

    stack.innerHTML = `
      <div class="p-4 bg-zinc-900 rounded-xl">
        <img src="${p.image_url}" class="w-full h-64 object-contain bg-white"/>
        <h2 class="text-xl mt-3">${p.name}</h2>
        <div class="text-green-400 text-2xl">$${p.price}</div>
        <a href="${p.affiliate_link}" target="_blank" class="block mt-4 bg-green-500 text-black text-center py-2 rounded">
          Buy
        </a>
      </div>
    `;
  }

  document.getElementById("swipe-like-btn")?.addEventListener("click", () => {
    i++;
    render();
  });

  document.getElementById("swipe-dislike-btn")?.addEventListener("click", () => {
    i++;
    render();
  });

  render();
});
