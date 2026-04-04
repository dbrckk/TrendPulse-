document.addEventListener("DOMContentLoaded", async function () {
  ensureDebugBox();

  const isDealsPage = document.getElementById("deals-grid");

  if (isDealsPage) {
    debugLog("PAGE", "DEALS PAGE DETECTED");
    await renderDealsPage();
  } else {
    debugLog("PAGE", "NOT DEALS PAGE (HOME)");
  }
});
