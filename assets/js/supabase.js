// assets/js/supabase.js

// ⚠️ CONFIG DIRECT (tu m’as donné les clés)
const SUPABASE_URL = "https://hyrofyfhmabhlqbucjdp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cm9meWZobWFiaGxxYnVjamRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjU1NjcsImV4cCI6MjA5MDMwMTU2N30.3BgysZzrE0eYMiyT4TvvupSZJpXOGq40V5YzA78rvhs";

// Création client global
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// CONFIG GLOBAL SITE
window.TRENDPULSE_CONFIG = {
  affiliateTag: "Drackk-20", // ⚠️ CHANGE si besoin
};

// Debug (très utile)
console.log("Supabase connected:", SUPABASE_URL);
