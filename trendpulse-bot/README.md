# TrendPulse Bot

Bot Node.js pour alimenter automatiquement Supabase avec des deals Amazon.

## Fonctionnement

- lit plusieurs flux RSS
- récupère les pages d'articles
- extrait les liens Amazon
- suit les redirections
- extrait l'ASIN
- fait un upsert dans Supabase

## Variables GitHub Secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AFFILIATE_TAG`

## Lancer en local

```bash
npm install
node sync-deals.js
