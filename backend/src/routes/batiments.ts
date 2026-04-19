import { Router, Request, Response } from 'express';
import pool from '../db';
import { cacheGet, cacheSet, CACHE_TTL } from '../middleware/cache';

const router = Router();

router.get('/stats', async (_req, res) => {
  const key = 'stats_globales';
  const cached = cacheGet(key);
  if (cached) return res.json({ ...cached, _cache: 'HIT' });
  try {
    const r = await pool.query('SELECT * FROM stats_globales');
    cacheSet(key, r.rows[0], CACHE_TTL.stats);
    res.json({ ...r.rows[0], _cache: 'MISS' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


router.get('/zones', async (_req, res) => {
  const key = 'stats_zones';
  const cached = cacheGet(key);
  if (cached) return res.json({ data: cached, _cache: 'HIT' });
  try {
    const r = await pool.query('SELECT * FROM stats_zones ORDER BY nb_batiments DESC');
    cacheSet(key, r.rows, CACHE_TTL.stats);
    res.json({ data: r.rows, _cache: 'MISS' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/classes', async (_req, res) => {
  const key = 'stats_classes';
  const cached = cacheGet(key);
  if (cached) return res.json({ data: cached, _cache: 'HIT' });
  try {
    const r = await pool.query('SELECT * FROM stats_classes');
    cacheSet(key, r.rows, CACHE_TTL.stats);
    res.json({ data: r.rows, _cache: 'MISS' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/dashboard', async (_req, res) => {
  const key = 'dashboard';
  const cached = cacheGet(key);
  if (cached) return res.json({ ...cached, _cache: 'HIT' });
  try {
    const [globales, zones, classes] = await Promise.all([
      pool.query('SELECT * FROM stats_globales'),
      pool.query('SELECT * FROM stats_zones ORDER BY nb_batiments DESC'),
      pool.query('SELECT * FROM stats_classes'),
    ]);
    const data = { globales: globales.rows[0], zones: zones.rows, classes: classes.rows };
    cacheSet(key, data, CACHE_TTL.stats);
    res.json({ ...data, _cache: 'MISS' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


router.get('/geojson', async (req, res) => {
  const zone  = req.query.zone as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 500, 2000);
  const key   = `geojson_${zone || 'all'}_${limit}`;
  const cached = cacheGet(key);
  if (cached) return res.json({ ...cached, _cache: 'HIT' });

  try {
    let query: string, params: (string | number)[];
    if (zone) {
      query = `SELECT ogc_fid AS id, zone_nom, classe_surface,
                      ROUND(surface_m2::numeric,1) AS surface_m2,
                      ST_AsGeoJSON(geom)::json AS geometry
               FROM batiments WHERE zone_nom=$1 ORDER BY RANDOM() LIMIT $2`;
      params = [zone, limit];
    } else {
      query = `SELECT ogc_fid AS id, zone_nom, classe_surface,
                      ROUND(surface_m2::numeric,1) AS surface_m2,
                      ST_AsGeoJSON(geom)::json AS geometry
               FROM batiments ORDER BY RANDOM() LIMIT $1`;
      params = [limit];
    }
    const r = await pool.query(query, params);
    const geojson = {
      type: 'FeatureCollection',
      features: r.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: { id: row.id, zone_nom: row.zone_nom,
                      classe_surface: row.classe_surface, surface_m2: row.surface_m2 }
      }))
    };
    cacheSet(key, geojson, CACHE_TTL.geojson);
    res.json({ ...geojson, _cache: 'MISS' });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/proches', async (req, res) => {
  const { lng, lat, limit } = req.query;
  if (!lng || !lat) return res.status(400).json({ error: 'lng et lat requis' });
  const lon = parseFloat(lng as string);
  const la  = parseFloat(lat as string);
  const k   = Math.min(parseInt(limit as string) || 5, 50);
  if (isNaN(lon) || isNaN(la)) return res.status(400).json({ error: 'Coordonnées invalides' });

  try {
    const r = await pool.query(`
      SELECT ogc_fid AS id, zone_nom, classe_surface,
             ROUND(surface_m2::numeric,1) AS surface_m2,
             ST_AsGeoJSON(geom)::json AS geometry,
             ROUND(ST_Distance(geom::geography,
               ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)::numeric,0) AS distance_m
      FROM batiments
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1,$2),4326) LIMIT $3`,
      [lon, la, k]);
    const geojson = {
      type: 'FeatureCollection',
      features: r.rows.map(row => ({
        type: 'Feature', geometry: row.geometry,
        properties: { id: row.id, zone_nom: row.zone_nom,
                      classe_surface: row.classe_surface,
                      surface_m2: row.surface_m2, distance_m: row.distance_m }
      }))
    };
    res.json(geojson);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;