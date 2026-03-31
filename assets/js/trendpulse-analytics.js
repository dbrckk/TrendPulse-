// assets/js/trendpulse-analytics.js

(function () {
  const endpoint = "https://api.trend-pulse.shop/track"; // change later if needed

  function sendEvent(type, data = {}) {
    try {
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          data,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent
        })
      });
    } catch (e) {
      console.log("Analytics error:", e);
    }
  }

  function trackPageView() {
    sendEvent("page_view", {
      path: window.location.pathname
    });
  }

  function trackClick(e) {
    const link = e.target.closest("a");
    if (!link) return;

    if (link.href && link.href.includes("amazon.com")) {
      sendEvent("affiliate_click", {
        href: link.href,
        text: link.textContent.trim()
      });
    }
  }

  function trackDealView() {
    const params = new URLSearchParams(window.location.search);
    const asin = params.get("asin");
    if (asin) {
      sendEvent("deal_view", { asin });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    trackPageView();
    trackDealView();
    document.addEventListener("click", trackClick);
  });
})();
