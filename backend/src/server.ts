import express     from 'express';
import cors        from 'cors';
import dotenv      from 'dotenv';
import lieuxRouter     from './routes/lieux';
import batimentsRouter from './routes/batiments';
import {
  rateLimiter,
  apiKeyAuth,
  corsOptions,
  cacheStats,
  cacheClear,
} from './middleware/cache';

dotenv.config();

const app  = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors(corsOptions));
app.use(express.json());


app.use('/api/', rateLimiter(200, 15 * 60 * 1000));
app.use('/api/batiments/geojson', rateLimiter(20, 60 * 1000));
app.use('/api/', apiKeyAuth);

app.use('/api/lieux',     lieuxRouter);
app.use('/api/batiments', batimentsRouter);

app.get('/', (_req, res) => {
  res.json({ project: 'DakarGeo v2', version: '2.0.0', health: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok', project: 'DakarGeo v2', version: '2.0.0',
    timestamp: new Date().toISOString(),
    cache: cacheStats(),
    architecture: {
      type: 'Distribuée — partitions PostgreSQL par zone',
      partitions: 6, database: 'Neon PostGIS', cache: 'In-memory TTL'
    },
  });
});

app.get('/api/monitoring', async (_req, res) => {
  try {
    const pool = (await import('./db')).default;
    const r = await pool.query(`
      SELECT zone_nom AS noeud, COUNT(*) AS batiments,
             ROUND(AVG(surface_m2)::numeric,1) AS surf_moy
      FROM batiments WHERE zone_nom IS NOT NULL
      GROUP BY zone_nom ORDER BY batiments DESC`);
    res.json({
      architecture: 'Partitions PostgreSQL LIST par zone',
      noeuds: r.rows.map((row, i) => ({
        id: i+1, noeud: row.noeud,
        batiments: Number(row.batiments),
        surf_moy: row.surf_moy + ' m²',
        statut: 'ACTIF', type: 'Partition PostgreSQL'
      })),
      cache: cacheStats(), timestamp: new Date().toISOString()
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/cache-clear', (req, res) => {
  if (process.env.API_KEY && req.headers['x-api-key'] !== process.env.API_KEY)
    return res.status(401).json({ error: 'Non autorisé' });
  cacheClear();
  res.json({ message: 'Cache vidé', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`DakarGeo v2 — port ${PORT}`);
  console.log(`Architecture distribuee — 6 partitions PostgreSQL`);
  console.log(`Rate limiting + Cache actifs`);
});