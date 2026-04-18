import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// ─────────────────────────────────────────────
// GET /api/batiments/stats
// Stats globales : total, surface min/max/moy/mediane
// ─────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM stats_globales`);
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Erreur /stats:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/zones
// Répartition des bâtiments par zone géographique
// ─────────────────────────────────────────────
router.get('/zones', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM stats_zones ORDER BY nb_batiments DESC`);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Erreur /zones:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/classes
// Distribution par classe de surface
// ─────────────────────────────────────────────
router.get('/classes', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM stats_classes`);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Erreur /classes:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/dashboard
// Toutes les données du portail en 1 appel
// ─────────────────────────────────────────────
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [globales, zones, classes] = await Promise.all([
      pool.query(`SELECT * FROM stats_globales`),
      pool.query(`SELECT * FROM stats_zones ORDER BY nb_batiments DESC`),
      pool.query(`SELECT * FROM stats_classes`),
    ]);

    res.json({
      globales: globales.rows[0],
      zones: zones.rows,
      classes: classes.rows,
    });
  } catch (err: any) {
    console.error('Erreur /dashboard:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/geojson?zone=Pikine&limit=500
// GeoJSON d'un échantillon de bâtiments pour la carte
// (766K bâtiments = trop lourd, on limite par zone)
// ─────────────────────────────────────────────
router.get('/geojson', async (req: Request, res: Response) => {
  try {
    const zone  = req.query.zone  as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 1000);

    let query: string;
    let params: (string | number)[];

    if (zone) {
      query = `
        SELECT
          ogc_fid                         AS id,
          zone_nom,
          classe_surface,
          ROUND(surface_m2::numeric, 1)   AS surface_m2,
          ST_AsGeoJSON(geom)::json        AS geometry
        FROM batiments
        WHERE zone_nom = $1
        ORDER BY RANDOM()
        LIMIT $2;
      `;
      params = [zone, limit];
    } else {
      query = `
        SELECT
          ogc_fid                         AS id,
          zone_nom,
          classe_surface,
          ROUND(surface_m2::numeric, 1)   AS surface_m2,
          ST_AsGeoJSON(geom)::json        AS geometry
        FROM batiments
        ORDER BY RANDOM()
        LIMIT $1;
      `;
      params = [limit];
    }

    const result = await pool.query(query, params);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id:             row.id,
          zone_nom:       row.zone_nom,
          classe_surface: row.classe_surface,
          surface_m2:     row.surface_m2,
        },
      })),
    };

    res.json(geojson);
  } catch (err: any) {
    console.error('Erreur /geojson:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/proches?lng=X&lat=Y&limit=10
// Bâtiments les plus proches d'un point (KNN)
// ─────────────────────────────────────────────
router.get('/proches', async (req: Request, res: Response) => {
  try {
    const { lng, lat, limit } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({ error: 'lng et lat requis' });
    }

    const longitude = parseFloat(lng as string);
    const latitude  = parseFloat(lat as string);
    const k         = Math.min(parseInt(limit as string) || 5, 50);

    if (isNaN(longitude) || isNaN(latitude)) {
      return res.status(400).json({ error: 'lng et lat doivent être des nombres' });
    }

    const result = await pool.query(`
      SELECT
        ogc_fid                        AS id,
        zone_nom,
        classe_surface,
        ROUND(surface_m2::numeric, 1)  AS surface_m2,
        ST_AsGeoJSON(geom)::json       AS geometry,
        ROUND(
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric, 0
        ) AS distance_m
      FROM batiments
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT $3;
    `, [longitude, latitude, k]);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id:             row.id,
          zone_nom:       row.zone_nom,
          classe_surface: row.classe_surface,
          surface_m2:     row.surface_m2,
          distance_m:     row.distance_m,
        },
      })),
    };

    res.json(geojson);
  } catch (err: any) {
    console.error('Erreur /proches:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/batiments/export?zone=Pikine
// Export COMPLET d'une zone en GeoJSON (streaming)
// Télécharge tous les bâtiments sans limite
// ─────────────────────────────────────────────
router.get('/export', async (req: Request, res: Response) => {
  const zone = req.query.zone as string | undefined;

  try {
    // Compter d'abord
    const countQ = zone
      ? `SELECT COUNT(*) FROM batiments WHERE zone_nom = $1`
      : `SELECT COUNT(*) FROM batiments`;
    const countR = await pool.query(countQ, zone ? [zone] : []);
    const total = parseInt(countR.rows[0].count);

    const filename = zone
      ? `dakargeo_${zone.replace(/[^a-zA-Z0-9]/g, '_')}_${total}bat.geojson`
      : `dakargeo_toutes_zones_${total}bat.geojson`;

    // Headers pour téléchargement direct
    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // Début du GeoJSON
    res.write('{"type":"FeatureCollection","features":[\n');

    // Requête par lots de 5000 pour ne pas exploser la mémoire
    const BATCH = 5000;
    let offset = 0;
    let first = true;

    while (offset < total) {
      const query = zone
        ? `SELECT ogc_fid, surface_m2, zone_nom, classe_surface,
             ST_AsGeoJSON(geom)::json AS geometry
           FROM batiments WHERE zone_nom = $1
           ORDER BY ogc_fid LIMIT $2 OFFSET $3`
        : `SELECT ogc_fid, surface_m2, zone_nom, classe_surface,
             ST_AsGeoJSON(geom)::json AS geometry
           FROM batiments
           ORDER BY ogc_fid LIMIT $1 OFFSET $2`;

      const params = zone ? [zone, BATCH, offset] : [BATCH, offset];
      const result = await pool.query(query, params);

      for (const row of result.rows) {
        const feature = JSON.stringify({
          type: 'Feature',
          geometry: row.geometry,
          properties: {
            id:             row.ogc_fid,
            surface_m2:     row.surface_m2,
            zone_nom:       row.zone_nom,
            classe_surface: row.classe_surface,
          },
        });
        res.write((first ? '' : ',\n') + feature);
        first = false;
      }

      offset += BATCH;
      // Laisser respirer le serveur
      await new Promise(r => setTimeout(r, 10));
    }

    // Fin du GeoJSON
    res.write('\n]}');
    res.end();

  } catch (err: any) {
    console.error('Erreur /export:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erreur export', detail: err.message });
    }
  }
});

export default router;