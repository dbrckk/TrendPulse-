(function () {
  const SUPABASE_URL =
    (window.ENV && window.ENV.SUPABASE_URL) ||
    "https://hyrofyfhmabhlqbucjdp.supabase.co";

  const SUPABASE_ANON_KEY =
    (window.ENV && window.ENV.SUPABASE_ANON_KEY) ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

  function createFallbackClient() {
    return {
      from() {
        return {
          select() {
            return Promise.resolve({
              data: [],
              error: new Error("Supabase client not initialized")
            });
          },
          eq() {
            return this;
          },
          ilike() {
            return this;
          },
          limit() {
            return this;
          },
          order() {
            return this;
          }
        };
      }
    };
  }

  if (
    typeof window === "undefined" ||
    typeof window.supabase === "undefined" ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error("[supabase] SDK not loaded");
    window.supabaseClient = createFallbackClient();
    return;
  }

  try {
    window.supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        },
        global: {
          headers: {
            "x-client-info": "trendpulse-web"
          }
        }
      }
    );

    window.TRENDPULSE_CONFIG = {
      siteUrl: "https://www.trend-pulse.shop",
      affiliateTag: "Drackk-20"
    };

    console.log("[supabase] client initialized");
  } catch (error) {
    console.error("[supabase] init failed:", error);
    window.supabaseClient = createFallbackClient();
  }
})();
