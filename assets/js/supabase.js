(function () {
  const SUPABASE_URL = "https://hyrofyfhmabhlqbucjdp.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
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
      affiliateTag: "Drackk-20"
    };

    console.log("[supabase] client initialized");
  } catch (error) {
    console.error("[supabase] init failed:", error);
    window.supabaseClient = createFallbackClient();
  }
})();
