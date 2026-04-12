# DakarGeo v2 🗺

Portail géospatial interactif des bâtiments et lieux d'intérêt de Dakar.

**Stack** : TypeScript · Node.js · Express · PostgreSQL · PostGIS · MapLibre GL JS · Chart.js  
**Hébergement** : Supabase · Render · GitHub Pages

**Auteur** : Seydina Alioune Diop — BTS Géomatique · CEDT G15, Dakar, Sénégal

## Fonctionnalités

- Carte interactive MapLibre des lieux d'intérêt (hôpitaux, écoles, marchés…)
- Recherche full-text PostGIS (index GIN)
- Lieux les plus proches par géolocalisation (index GiST / KNN)
- Portail de monitoring des 766 423 bâtiments de Dakar
- Dashboard avec statistiques par zone et classe de surface
- Mode sombre · Responsive mobile

## API Endpoints

```
GET /api/lieux                    Tous les lieux
GET /api/lieux?type=hôpital       Filtrer par type
GET /api/lieux/search?q=sandaga   Recherche texte
GET /api/lieux/proches?lng=X&lat=Y Lieux proches
GET /api/batiments/dashboard      Stats bâtiments
GET /api/batiments/zones          Stats par zone
GET /api/batiments/classes        Stats par surface
GET /api/batiments/geojson        GeoJSON bâtiments
GET /api/health                   Health check
```

## Installation locale

```bash
cd backend
npm install
cp .env.example .env   # remplir DATABASE_URL
npm run dev
```
