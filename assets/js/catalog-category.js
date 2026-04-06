document.addEventListener("DOMContentLoaded", async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    let category = params.get("category");

    if (!category) {
      const path = window.location.pathname;
      category = path.replace("/", "").replace(".html", "");
    }

    category = (category || "general").toLowerCase();

    document.getElementById("category-title").innerText =
      category.charAt(0).toUpperCase() + category.slice(1);

    const products = await window.TrendPulseData.fetchCatalogByCategory(category, 60);

    renderProducts(products);

  } catch (e) {
    console.error("CATEGORY ERROR:", e);
    document.getElementById("products").innerHTML =
      "<p style='color:red'>Error loading products</p>";
  }
});

function renderProducts(products) {
  const container = document.getElementById("products");

  if (!products || products.length === 0) {
    container.innerHTML = "<p>No products found</p>";
    return;
  }

  container.innerHTML = products
    .map(
      (p) => `
      <div class="card">
        <img src="${p.image}" />
        <h3>${p.name}</h3>
        <p>${p.price}€</p>
        <a href="${p.affiliate}" target="_blank">View</a>
      </div>
    `
    )
    .join("");
}
