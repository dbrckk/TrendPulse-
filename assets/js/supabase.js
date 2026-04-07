(function () {
  // 🔥 Récupération des variables injectées depuis index.html
  const SUPABASE_URL =
    window?.ENV?.SUPABASE_URL || "https://hyrofyfhmabhlqbucjdp.supabase.co";

  const SUPABASE_ANON_KEY =
    window?.ENV?.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

  if (!window.supabase) {
    console.error("❌ Supabase SDK not loaded");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ Missing Supabase ENV variables");
    return;
  }

  try {
    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false
        },
        global: {
          headers: {
            "x-application-name": "trendpulse"
          }
        }
      }
    );

    window.supabaseClient = client;

    console.log("✅ Supabase initialized", {
      url: SUPABASE_URL
    });

  } catch (error) {
    console.error("❌ Supabase init error:", error);
  }
})();
