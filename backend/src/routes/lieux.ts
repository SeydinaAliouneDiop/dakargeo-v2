import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    let query: string;
    let params: string[];

    if (type && typeof type === 'string') {
      query = `
        SELECT
          id,
          nom,
          type,
          description,
          adresse,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM lieux
        WHERE type = $1
        ORDER BY nom;
      `;
      params = [type];
    } else {
      query = `
        SELECT
          id,
          nom,
          type,
          description,
          adresse,
          ST_AsGeoJSON(geom)::json AS geometry
        FROM lieux
        ORDER BY nom;
      `;
      params = [];
    }

    const result = await pool.query(query, params);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id:          row.id,
          nom:         row.nom,
          type:        row.type,
          description: row.description,
          adresse:     row.adresse,
        },
      })),
    };

    res.json(geojson);

  } catch (err: any) {
    console.error('Erreur GET /api/lieux:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ error: 'Paramètre q requis (minimum 2 caractères)' });
    }

    const query = `
      SELECT
        id,
        nom,
        type,
        description,
        adresse,
        ST_AsGeoJSON(geom)::json AS geometry,
        ts_rank(to_tsvector('french', nom), plainto_tsquery('french', $1)) AS rank
      FROM lieux
      WHERE to_tsvector('french', nom) @@ plainto_tsquery('french', $1)
      ORDER BY rank DESC
      LIMIT 10;
    `;

    const result = await pool.query(query, [q.trim()]);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id:          row.id,
          nom:         row.nom,
          type:        row.type,
          description: row.description,
          adresse:     row.adresse,
          score:       parseFloat(row.rank).toFixed(4),
        },
      })),
    };

    res.json(geojson);

  } catch (err: any) {
    console.error('Erreur GET /api/lieux/search:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.get('/proches', async (req: Request, res: Response) => {
  try {
    const { lng, lat, limit, type } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({ error: 'Paramètres lng et lat requis' });
    }

    const longitude = parseFloat(lng as string);
    const latitude  = parseFloat(lat as string);
    const k         = Math.min(parseInt(limit as string) || 5, 20);

    if (isNaN(longitude) || isNaN(latitude)) {
      return res.status(400).json({ error: 'lng et lat doivent être des nombres' });
    }

    let query: string;
    let params: (number | string)[];

    if (type && typeof type === 'string') {
      query = `
        SELECT
          id,
          nom,
          type,
          description,
          adresse,
          ST_AsGeoJSON(geom)::json AS geometry,
          ROUND(
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            )::numeric, 0
          ) AS distance_m
        FROM lieux
        WHERE type = $3
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT $4;
      `;
      params = [longitude, latitude, type, k];
    } else {
      query = `
        SELECT
          id,
          nom,
          type,
          description,
          adresse,
          ST_AsGeoJSON(geom)::json AS geometry,
          ROUND(
            ST_Distance(
              geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            )::numeric, 0
          ) AS distance_m
        FROM lieux
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
        LIMIT $3;
      `;
      params = [longitude, latitude, k];
    }

    const result = await pool.query(query, params);

    const geojson = {
      type: 'FeatureCollection',
      features: result.rows.map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          id:          row.id,
          nom:         row.nom,
          type:        row.type,
          description: row.description,
          adresse:     row.adresse,
          distance_m:  row.distance_m,
        },
      })),
    };

    res.json(geojson);

  } catch (err: any) {
    console.error('Erreur GET /api/lieux/proches:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

export default router;