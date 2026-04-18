import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lieuxRouter     from './routes/lieux';
import batimentsRouter from './routes/batiments';

dotenv.config();

const app  = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api/lieux',     lieuxRouter);
app.use('/api/batiments', batimentsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: 'DakarGeo v2', version: '2.0.0' });
});

app.get('/', (_req, res) => {
  res.json({ message: 'DakarGeo v2 API', health: '/api/health' });
});

app.listen(PORT, () => {
  console.log(`DakarGeo v2 — port ${PORT}`);
});