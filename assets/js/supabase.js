// assets/js/supabase.js

const SUPABASE_URL = "https://hyrofyfhmabhlqbucjdp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

if (!window.supabase || !window.supabase.createClient) {
  console.error("Supabase library is missing.");
} else {
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

window.TRENDPULSE_CONFIG = {
  affiliateTag: "Drackk-20"
};
