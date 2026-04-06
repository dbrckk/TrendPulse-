(function () {
  const SUPABASE_URL = "https://hyrofyfhmabhlqbucjdp.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase library not loaded");
    return;
  }

  try {
    const client = window.supabase.createClient(
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

    window.supabaseClient = client;
    console.log("Supabase initialized");
  } catch (err) {
    console.error("Supabase init error:", err);
  }
})();
