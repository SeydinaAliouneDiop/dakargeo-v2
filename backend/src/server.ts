import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lieuxRouter     from './routes/lieux';
import batimentsRouter from './routes/batiments';

dotenv.config();

const app  = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json());

// ── Routes ──
app.use('/api/lieux',     lieuxRouter);
app.use('/api/batiments', batimentsRouter);

// Health check (Render ping)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: 'DakarGeo v2', version: '2.0.0' });
});

app.listen(PORT, () => {
  console.log(`🚀 DakarGeo v2 — serveur démarré sur port ${PORT}`);
});
