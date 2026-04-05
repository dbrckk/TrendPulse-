(function () {
  const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

  function canInitSupabase() {
    return (
      typeof window !== "undefined" &&
      typeof window.supabase !== "undefined" &&
      typeof window.supabase.createClient === "function"
    );
  }

  function createFallbackClient() {
    return {
      from() {
        return {
          select() {
            return Promise.resolve({
              data: [],
              error: new Error("Supabase client not initialized")
            });
          }
        };
      }
    };
  }

  if (!canInitSupabase()) {
    console.error("[supabase] CDN client not loaded");
    window.supabaseClient = createFallbackClient();
    return;
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_URL.includes("YOUR_PROJECT_ID") ||
    SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY")
  ) {
    console.error("[supabase] Missing real SUPABASE_URL or SUPABASE_ANON_KEY");
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

    console.log("[supabase] client initialized");
  } catch (error) {
    console.error("[supabase] init failed:", error);
    window.supabaseClient = createFallbackClient();
  }
})();
