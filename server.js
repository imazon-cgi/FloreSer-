// ─────────────────────────────────────────────────────────────
// IMAZON GEO – SERVIDOR (UTF-8 + EE obrigatório + CSV transcode)
// ─────────────────────────────────────────────────────────────

/* eslint-disable no-console */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const csv     = require('csv-parser');
const axios   = require('axios');
const iconv   = require('iconv-lite');
const ee      = require('@google/earthengine');
const cors    = require('cors');

// ========================= Config =========================
const PORT          = process.env.PORT || 3003;
const ROOT_DIR      = __dirname;
const DASHBOARD_DIR = path.join(ROOT_DIR, 'app', 'dashboards');
const DATASET_DIR   = path.join(ROOT_DIR, 'dataset');

const CSV_FILE = path.join(DATASET_DIR, 'floreser-9-22-1-ages-sf.csv');
const LIMITE_AMAZONIA_LEGAL = path.join(DATASET_DIR, 'limite_municipios_amz_legal.geojson');
const CSV_SOURCE_ENCODING = process.env.CSV_SOURCE_ENCODING || 'latin1';


const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

function withCharset(type) {
  if (!type) return 'application/octet-stream';
  const needs = type.startsWith('text/')
             || type === 'application/javascript'
             || type === 'application/json'
             || type === 'application/xml';
  return needs ? `${type}; charset=utf-8` : type;
}

// ========================= Earth Engine =========================
const PRIVATE_KEY_PATH = path.join(__dirname, 'privatekey.json');
if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error('❌ Faltando privatekey.json na raiz do projeto.');
  process.exit(1);
}
const privateKey = require(PRIVATE_KEY_PATH);

let eeReady = null;
function initializeEE() {
  if (eeReady) return eeReady;
  eeReady = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => ee.initialize(null, null, resolve, reject),
      reject
    );
  })
    .then(() => console.log('✅ Earth Engine autenticado'))
    .catch(err => {
      eeReady = null;
      console.error('❌ Falha EE:', err);
      throw err;
    });
  return eeReady;
}

function toTileUrl(mapObj) {
  if (mapObj && mapObj.urlFormat) return mapObj.urlFormat;
  if (mapObj && mapObj.mapid && mapObj.token) {
    return `https://earthengine.googleapis.com/map/${mapObj.mapid}/{z}/{x}/{y}?token=${mapObj.token}`;
  }
  throw new Error('Formato inesperado de getMap() do EE');
}

async function getSRTMMapUrl() {
  await initializeEE();
  const asset = 'projects/imazon-simex/FLORESER/floreser-collection-9-22-1-ages-sf/floreser-2023-22-1';
  const img   = ee.Image(asset);
  const vis   = { min: 1, max: 38, palette: ['#e7f8eb', '#12c23f'] };
  const map   = img.getMap(vis);
  return toTileUrl(map);
}

async function getFloreserTileUrl() {
  await initializeEE();
  const fc  = ee.FeatureCollection('projects/imazon-simex/FLORESER/floreser-collection-10-v12-sv-ages-sf');
  const img = ee.Image().paint(fc, 1, 1).visualize({ palette: ['#008055'], opacity: 0.8 });
  const map = img.getMap({});
  return toTileUrl(map);
}

// ========================= Helpers CSV =========================
function readCsvUtf8(csvPath, srcEnc = CSV_SOURCE_ENCODING) {
  // Transcodifica para UTF-8 ANTES do csv-parser
  return fs.createReadStream(csvPath)
    .pipe(iconv.decodeStream(srcEnc))
    .pipe(iconv.encodeStream('utf8'))
    .pipe(csv());
}

// ========================= App =========================
const app = express();

// CORS (se o front estiver em outra origem/porta)
app.use(cors({ origin: true }));

// Healthcheck simples
app.get('/healthz', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    ok: true,
    port: PORT,
    csvEncoding: CSV_SOURCE_ENCODING,
    municipiosPath: LIMITE_AMAZONIA_LEGAL,
  });
});

// Intercepta CSVs servidos de /dataset para enviar em UTF-8
app.get(/^\/dataset\/.*\.csv$/i, (req, res, next) => {
  try {
    const filePath = path.join(ROOT_DIR, req.path.replace(/^\//, ''));
    if (!filePath.startsWith(DATASET_DIR) || !fs.existsSync(filePath)) return next();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    fs.createReadStream(filePath)
      .pipe(iconv.decodeStream(CSV_SOURCE_ENCODING))
      .pipe(iconv.encodeStream('utf8'))
      .pipe(res);
  } catch (e) {
    console.error('[CSV static] erro:', e);
    next();
  }
});

// Demais estáticos com charset utf-8 quando aplica
function setUtf8Header(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', withCharset(MIME[ext] || 'application/octet-stream'));
}
app.use('/dataset', express.static(DATASET_DIR, { setHeaders: setUtf8Header }));
app.use('/css',     express.static(path.join(ROOT_DIR, 'css'),     { setHeaders: setUtf8Header }));
app.use('/js',      express.static(path.join(ROOT_DIR, 'js'),      { setHeaders: setUtf8Header }));
app.use('/assets',  express.static(path.join(ROOT_DIR, 'assets'),  { setHeaders: setUtf8Header }));
app.use('/img',     express.static(path.join(ROOT_DIR, 'img'),     { setHeaders: setUtf8Header }));

// ------------------------- Rotas API ---------------------------

app.get('/municipios-amazonia', (_req, res) => {
  try {
    const filePath = LIMITE_AMAZONIA_LEGAL;

    if (!fs.existsSync(filePath)) {
      console.error('[/municipios-amazonia] arquivo não encontrado:', filePath);
      return res
        .status(404)
        .json({ error: 'GeoJSON de municípios não encontrado', path: filePath });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.geojson' && ext !== '.json') {
      console.error('[/municipios-amazonia] extensão inválida:', ext);
      return res.status(400).json({ error: 'Arquivo de municípios deve ser .geojson ou .json' });
    }

    fs.readFile(filePath, 'utf8', (err, text) => {
      if (err) {
        console.error('[/municipios-amazonia] erro ao ler arquivo:', err);
        return res.status(500).json({ error: 'Falha ao ler o GeoJSON local' });
      }
      try {
        const json = JSON.parse(text);

        // Validação mínima para Leaflet
        if (!json || json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
          return res.status(500).json({
            error: 'Conteúdo não é um FeatureCollection válido',
            path: filePath
          });
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min
        return res.json(json);
      } catch (parseErr) {
        console.error('[/municipios-amazonia] JSON inválido:', parseErr.message);
        return res.status(500).json({
          error: 'Conteúdo do arquivo não é um JSON válido',
          message: parseErr.message,
          path: filePath
        });
      }
    });
  } catch (err) {
    console.error('[/municipios-amazonia] erro inesperado:', err);
    res.status(500).json({ error: 'Erro ao obter GeoJSON de municípios (local)' });
  }
});

app.get('/floreser-url', async (_req, res) => {
  try {
    const url = await getFloreserTileUrl();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ url });
  } catch (err) {
    console.error('[/floreser-url] erro:', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/srtm-url', async (_req, res) => {
  try {
    const url = await getSRTMMapUrl();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ url });
  } catch (err) {
    console.error('[/srtm-url] erro:', err);
    res.status(500).json({ error: 'Erro ao obter URL SRTM' });
  }
});

app.get('/lista-estados', (_req, res) => {
  const estados = new Set();
  readCsvUtf8(CSV_FILE)
    .on('data', row => { if (row.state) estados.add(String(row.state).trim()); })
    .on('end', () => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json([...estados]);
    })
    .on('error', err => {
      console.error('[/lista-estados] erro:', err);
      res.status(500).send('Erro ao carregar estados');
    });
});

app.get('/lista-municipios/:estado', (req, res) => {
  const uf = String(req.params.estado || '').trim();
  const municipios = new Set();
  readCsvUtf8(CSV_FILE)
    .on('data', row => {
      if (row.state && row.name && String(row.state).trim() === uf) {
        municipios.add(String(row.name).trim());
      }
    })
    .on('end', () => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json([...municipios]);
    })
    .on('error', err => {
      console.error('[/lista-municipios] erro:', err);
      res.status(500).send('Erro ao carregar municípios');
    });
});

app.get('/area-data', (_req, res) => {
  const data = [];
  readCsvUtf8(CSV_FILE)
    .on('data', row => {
      const y = Number(row.year);
      const a = Number(row.area);
      data.push({
        state: row.state,
        name:  row.name,
        year:  Number.isFinite(y) ? y : null,
        area:  Number.isFinite(a) ? a : 0
      });
    })
    .on('end', () => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(data);
    })
    .on('error', err => {
      console.error('[/area-data] erro:', err);
      res.status(500).send('Erro ao carregar dados');
    });
});

app.get('/municipios-area-data', (req, res) => {
  const startYear = parseInt(req.query.startYear, 10) || 2008;
  const endYear   = parseInt(req.query.endYear, 10)   || 2024;

  const linhas = [];
  readCsvUtf8(CSV_FILE)
    .on('data', row => {
      const y = Number(row.year);
      if (row.name && row.area && row.state && Number.isFinite(y) && y >= startYear && y <= endYear) {
        linhas.push({
          municipio: String(row.name).trim(),
          state:     String(row.state).trim(),
          area:      Number(row.area) || 0
        });
      }
    })
    .on('end', () => {
      const agreg = linhas.reduce((acc, r) => {
        const key = `${r.state}__${r.municipio}`;
        if (!acc[key]) acc[key] = { municipio: r.municipio, state: r.state, area: 0 };
        acc[key].area += r.area;
        return acc;
      }, {});
      const arr = Object.values(agreg).sort((a, b) => b.area - a.area);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.json(arr);
    })
    .on('error', err => {
      console.error('[/municipios-area-data] erro:', err);
      res.status(500).send('Erro ao processar CSV');
    });
});

// ----------------------- Dashboards HTML ----------------------
app.use((req, res, next) => {
  let pathname = req.path;
  if (pathname.startsWith('/app/dashboards')) {
    pathname = pathname.replace(/^\/app\/dashboards/, '') || '/';
  }

  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(DASHBOARD_DIR, 'index.html');
  } else {
    filePath = path.join(DASHBOARD_DIR, pathname);
    if (!path.extname(filePath)) {
      const tryHtml = `${filePath}.html`;
      filePath = fs.existsSync(tryHtml) ? tryHtml : path.join(DASHBOARD_DIR, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && filePath.startsWith(DASHBOARD_DIR)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', withCharset(MIME[ext] || 'application/octet-stream'));
    return res.sendFile(filePath);
  }
  next();
});

// 404
app.use((req, res) => {
  res.status(404).set('Content-Type', 'text/plain; charset=utf-8');
  res.send(`404 – ${req.path} não encontrado.`);
});

// ========================= Start =========================
console.log('> Config:');
console.log('  - PORT:', PORT);
console.log('  - CSV_SOURCE_ENCODING:', CSV_SOURCE_ENCODING);
console.log('  - LIMITE_AMAZONIA_LEGAL:', LIMITE_AMAZONIA_LEGAL);

initializeEE()
  .then(() => app.listen(PORT, () => console.log(`🚀  http://localhost:${PORT}`)))
  .catch(() => process.exit(1));
