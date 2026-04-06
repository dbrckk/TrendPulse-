async function loadDeals() {
  try {
    const deals = await window.TrendPulseData.fetchDeals(30);
    renderDeals(deals);
  } catch (e) {
    console.error("DEALS ERROR:", e);
  }
}

function renderDeals(deals) {
  const container = document.getElementById("deals");

  if (!deals.length) {
    container.innerHTML = "<p>No deals found</p>";
    return;
  }

  container.innerHTML = deals
    .map(
      (d) => `
      <div class="card">
        <img src="${d.image}" />
        <h3>${d.name}</h3>
        <p>${d.price}€</p>
        <a href="${d.affiliate}" target="_blank">View</a>
      </div>
    `
    )
    .join("");
}
