-- ============================================================
-- DakarGeo v2 — 02_setup_batiments.sql
-- À exécuter dans Supabase SQL Editor APRÈS l'import du SHP
-- ============================================================
-- ÉTAPE PRÉALABLE (dans ton terminal local) :
-- ogr2ogr -f "PostgreSQL" \
--   "PG:host=db.[TON_ID].supabase.co port=5432 dbname=postgres user=postgres password=[MOT_DE_PASSE] sslmode=require" \
--   BATIMENTS_DAKAR.shp -nln batiments -t_srs EPSG:4326 -lco GEOMETRY_NAME=geom
-- ============================================================

-- 1. Ajouter les colonnes calculées
ALTER TABLE batiments ADD COLUMN IF NOT EXISTS surface_m2    FLOAT;
ALTER TABLE batiments ADD COLUMN IF NOT EXISTS zone_nom      TEXT;
ALTER TABLE batiments ADD COLUMN IF NOT EXISTS classe_surface TEXT;

-- 2. Calculer les surfaces en m² (en UTM28N pour avoir des mètres)
UPDATE batiments
SET surface_m2 = ST_Area(ST_Transform(geom, 32628));

-- 3. Classifier par zone géographique
UPDATE batiments
SET zone_nom = CASE
  WHEN ST_X(ST_Centroid(geom)) < -17.45 THEN 'Dakar Centre'
  WHEN ST_X(ST_Centroid(geom)) < -17.40 THEN 'Plateau / Médina'
  WHEN ST_X(ST_Centroid(geom)) < -17.35 THEN 'Parcelles Assainies'
  WHEN ST_X(ST_Centroid(geom)) < -17.30 THEN 'Guédiawaye'
  WHEN ST_X(ST_Centroid(geom)) < -17.25 THEN 'Pikine'
  ELSE 'Rufisque / Périphérie'
END;

-- 4. Classifier par taille
UPDATE batiments
SET classe_surface = CASE
  WHEN surface_m2 < 25   THEN '< 25 m²'
  WHEN surface_m2 < 50   THEN '25–50 m²'
  WHEN surface_m2 < 100  THEN '50–100 m²'
  WHEN surface_m2 < 200  THEN '100–200 m²'
  WHEN surface_m2 < 500  THEN '200–500 m²'
  WHEN surface_m2 < 1000 THEN '500–1000 m²'
  ELSE '> 1000 m²'
END;

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_batiments_geom    ON batiments USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_batiments_zone    ON batiments (zone_nom);
CREATE INDEX IF NOT EXISTS idx_batiments_classe  ON batiments (classe_surface);
CREATE INDEX IF NOT EXISTS idx_batiments_surface ON batiments (surface_m2);

-- 6. Vue stats globales
CREATE OR REPLACE VIEW stats_globales AS
SELECT
  COUNT(*)                                                                  AS total_batiments,
  ROUND(MIN(surface_m2)::numeric, 1)                                        AS surface_min,
  ROUND(MAX(surface_m2)::numeric, 1)                                        AS surface_max,
  ROUND(AVG(surface_m2)::numeric, 1)                                        AS surface_moy,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY surface_m2)::numeric, 1) AS surface_mediane,
  ROUND((SUM(surface_m2) / 1000000)::numeric, 2)                            AS surface_totale_km2
FROM batiments;

-- 7. Vue stats par zone
CREATE OR REPLACE VIEW stats_zones AS
SELECT
  zone_nom,
  COUNT(*)                              AS nb_batiments,
  ROUND(AVG(surface_m2)::numeric, 1)    AS surface_moy,
  ROUND(MIN(surface_m2)::numeric, 1)    AS surface_min,
  ROUND(MAX(surface_m2)::numeric, 1)    AS surface_max,
  ROUND((SUM(surface_m2)/1000000)::numeric, 3) AS surface_totale_km2
FROM batiments
WHERE zone_nom IS NOT NULL
GROUP BY zone_nom
ORDER BY nb_batiments DESC;

-- 8. Vue stats par classe
CREATE OR REPLACE VIEW stats_classes AS
SELECT
  classe_surface,
  COUNT(*)                           AS nb_batiments,
  ROUND(AVG(surface_m2)::numeric, 1) AS surface_moy
FROM batiments
WHERE classe_surface IS NOT NULL
GROUP BY classe_surface
ORDER BY MIN(surface_m2);
