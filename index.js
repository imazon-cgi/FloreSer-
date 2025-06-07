// Importa as bibliotecas necessárias
const express = require('express');
const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const axios = require('axios').default;

// Caminho para o arquivo de credenciais do Google Cloud (privatekey.json)
const privateKey = require('./privatekey.json');

// Cria uma aplicação Express
const app = express();
const PORT = 3000;

// Middleware para servir arquivos estáticos da pasta 'public'
app.use(express.static('public'));

// Função para inicializar o Earth Engine com autenticação
async function initializeEE() {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(privateKey, 
      () => {
        ee.initialize(null, null, 
          () => {
            console.log('Earth Engine authenticated successfully!');
            resolve();
          }, 
          (err) => {
            console.error('Error initializing Earth Engine:', err);
            reject(err);
          });
      }, 
      (err) => {
        console.error('Error during authentication:', err);
        reject(err);
      });
  });
}

// Função para obter a URL da imagem SRTM
async function getSRTMMapUrl() {
  try {
    await initializeEE();
    const asset_floreser_col9 = 'projects/imazon-simex/FLORESER/floreser-collection-9-22-1-ages-sf/floreser-2023-22-1';
    const sv_col9 = ee.Image(asset_floreser_col9);

    const vis_flor = {
      min: 1,
      max: 38,
      palette: ['#e7f8eb', '#cff2d8', '#b7ecc5', '#a0e6b2', '#88e09f', '#70da8b', '#59d478', '#41ce65', '#29c852', '#12c23f']
    };

    const mapId = sv_col9.getMap(vis_flor);
    return mapId.urlFormat;
  } catch (error) {
    console.error('Failed to get SRTM image URL:', error);
    throw error;
  }
}


// Rota para retornar a URL da imagem SRTM
app.get('/srtm-url', async (req, res) => {
  try {
    const url = await getSRTMMapUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).send('Error retrieving SRTM image URL');
  }
});

// Rota para servir o GeoJSON baixando diretamente do GitHub
app.get('/municipios-amazonia', async (req, res) => {
  try {
    const geojsonUrl = 'https://github.com/imazon-cgi/simex/raw/refs/heads/main/datasets/geojson/limite_municipios_amz_legal.geojson';
    const response = await axios.get(geojsonUrl);

    if (response.status === 200) {
      res.json(response.data);
    } else {
      throw new Error('Erro ao obter GeoJSON');
    }
  } catch (error) {
    console.error('Erro ao obter os municípios da Amazônia Legal:', error);
    res.status(500).send('Erro ao obter os municípios da Amazônia Legal.');
  }
});

// Rota para obter a lista de estados únicos do arquivo CSV
app.get('/lista-estados', (req, res) => {
  let estados = new Set();
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', (row) => {
      if (row.state) estados.add(row.state.trim());
    })
    .on('end', () => {
      res.json([...estados]);
    })
    .on('error', (error) => {
      console.error('Erro ao carregar estados:', error);
      res.status(500).send('Erro ao carregar estados');
    });
});

// Rota para obter a lista de municípios por estado
app.get('/lista-municipios/:estado', (req, res) => {
  const estado = req.params.estado.trim();
  let municipios = new Set();
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', (row) => {
      if (row.state && row.name && row.state.trim() === estado) {
        municipios.add(row.name.trim());
      }
    })
    .on('end', () => {
      res.json([...municipios]);
    })
    .on('error', (error) => {
      console.error('Erro ao carregar municípios:', error);
      res.status(500).send('Erro ao carregar municípios');
    });
});



// Rota para retornar os dados processados para o gráfico
app.get('/area-data', (req, res) => {
  let data = [];
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', (row) => {
      data.push({
        state: row.state,
        name: row.name,  // Incluindo o nome do município
        year: parseInt(row.year),
        area: parseFloat(row.area)
      });
    })
    .on('end', () => {
      res.json(data);
    })
    .on('error', (error) => {
      console.error('Erro ao carregar dados para gráfico:', error);
      res.status(500).send('Erro ao carregar dados');
    });
});


// Rota para retornar os dados agregados dos municípios
// Rota para retornar os dados agregados dos municípios com filtro de ano
app.get('/municipios-area-data', (req, res) => {
  const startYear = parseInt(req.query.startYear) || 2008;
  const endYear = parseInt(req.query.endYear) || 2023;

  let data = [];
  fs.createReadStream(path.join(__dirname, 'dataset', 'floreser-9-22-1-ages-sf.csv'))
    .pipe(csv())
    .on('data', (row) => {
      if (row.name && row.area && row.state) {
        const year = parseInt(row.year);
        if (year >= startYear && year <= endYear) {
          data.push({
            municipio: row.name.trim(),
            state: row.state.trim(),
            year: year,
            area: parseFloat(row.area)
          });
        }
      }
    })
    .on('end', () => {
      // Agrupar por município e somar a área total
      const municipiosMap = data.reduce((acc, item) => {
        const key = `${item.state}_${item.municipio}`;
        if (!acc[key]) {
          acc[key] = { municipio: item.municipio, state: item.state, area: 0 };
        }
        acc[key].area += item.area;
        return acc;
      }, {});

      // Converter para array e ordenar por área
      const municipiosArray = Object.values(municipiosMap)
        .sort((a, b) => b.area - a.area); // Ordenar por área acumulada

      res.json(municipiosArray);
    })
    .on('error', (error) => {
      console.error('Erro ao processar o CSV:', error);
      res.status(500).send('Erro ao processar o arquivo CSV.');
    });
});




// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
