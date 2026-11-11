import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.js';
import productsRouter from './routes/products.js';
import reportsRouter from './routes/reports.js';
import dashboardRouter from './routes/dashboard.js';
import stockRouter from './routes/stock.js';
import uploadsRouter from './routes/uploads.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { securityHeaders, corsMiddleware } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(securityHeaders());
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});

app.use('/api', corsMiddleware());
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/stock', stockRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api', notFoundApi);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
