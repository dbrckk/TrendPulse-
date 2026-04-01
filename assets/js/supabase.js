// assets/js/supabase.js

window.TRENDPULSE_SUPABASE_CONFIG = {
  url: "https://hyrofyfhmabhlqbucjdp.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs"
};

if (!window.supabase || !window.supabase.createClient) {
  console.error("Supabase client library is missing.");
} else {
  window.supabaseClient = window.supabase.createClient(
    window.TRENDPULSE_SUPABASE_CONFIG.url,
    window.TRENDPULSE_SUPABASE_CONFIG.anonKey
  );
}
