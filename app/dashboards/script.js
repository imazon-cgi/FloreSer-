let areaChartInstance;
let municipioChartInstance;
let areaChartLargeInstance;
let municipioChartLargeInstance;

// --- Guard reentrante para evitar stack overflow ---
let isApplyingYearFilter = false;

const chartColors = [
  'rgba(27, 94, 32, 0.8)',    
  'rgba(0, 121, 107, 0.8)',   
  'rgba(255, 109, 0, 0.8)',   
  'rgba(21, 101, 192, 0.8)',  
  'rgba(94, 53, 177, 0.8)',   
  'rgba(183, 28, 28, 0.8)',   
  'rgba(0, 150, 136, 0.8)',   
  'rgba(255, 152, 0, 0.8)',   
  'rgba(63, 81, 181, 0.8)',   
  'rgba(156, 39, 176, 0.8)'   
];

const chartBorders = [
  'rgba(27, 94, 32, 1)',
  'rgba(0, 121, 107, 1)',
  'rgba(255, 109, 0, 1)',
  'rgba(21, 101, 192, 1)',
  'rgba(94, 53, 177, 1)',
  'rgba(183, 28, 28, 1)',
  'rgba(0, 150, 136, 1)',
  'rgba(255, 152, 0, 1)',
  'rgba(63, 81, 181, 1)',
  'rgba(156, 39, 176, 1)'
];


function toTitleCasePt(str = '') {
  if (!str) return '';
  const small = new Set([
    'da','de','do','das','dos','e','di','du','d\'','d’','a','o','as','os'
  ]);
  // normaliza: "SÃO JOÃO DA BARRA" -> ["são","joão","da","barra"]
  const words = str.toLowerCase().split(/\s+/);
  return words.map((w, i) => {
    // mantém "d'água" com D' minúsculo e próxima maiúscula
    if (small.has(w) && i !== 0) return w;
    
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function normalizeStr(s = '') {
  return String(s)
    .normalize('NFD')                    // separa acentos
    .replace(/\p{Diacritic}/gu, '')      // remove acentos
    .toLowerCase()
    .trim();
}
function eqStr(a, b) {
  return normalizeStr(a) === normalizeStr(b);
}
// ---- Helpers UI ----

function showLoader(msg = 'Carregando dados...') {
  const el = document.getElementById('loader');
  if (!el) return;
  const t = el.querySelector('.loader-text');
  if (t) t.textContent = msg;
  el.style.display = 'flex';
}

function hideLoader() {
  const el = document.getElementById('loader');
  if (el) el.style.display = 'none';
}

function destroyChart(chartInstance) {
  if (chartInstance) chartInstance.destroy();
}

// Modal de aviso (Bootstrap)
function showWarningModal(title, message) {
  const modalEl = document.getElementById('genericWarningModal');
  if (!modalEl) {
    alert(`${title}\n\n${message}`);
    return;
  }
  const titleEl = modalEl.querySelector('.modal-title');
  const bodyEl = modalEl.querySelector('.modal-body');
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = message;

  
  if (window.bootstrap && bootstrap.Modal) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  } else {
    // fallback
    modalEl.style.display = 'block';
  }
}


function getYearFilters() {
  const startYearEl = document.getElementById('startYear');
  const endYearEl   = document.getElementById('endYear');

  const startYear = parseInt(startYearEl?.value, 10) || 1986;
  // Se existir o select endYear, usa o valor dele; senão, usa ano atual - 1
  const endYear   = endYearEl
    ? (parseInt(endYearEl.value, 10) || (new Date().getFullYear() - 1))
    : (new Date().getFullYear() - 1);

  // Garantia: ano inicial não pode ser maior que ano final
  if (startYear > endYear) {
    alert('O ano inicial não pode ser maior que o ano final.');
    if (startYearEl) startYearEl.value = String(endYear);
    return { startYear: endYear, endYear };
  }

  return { startYear, endYear };
}




let _yearBoundsCache = null;

async function getDataYearBounds() {
  if (_yearBoundsCache) return _yearBoundsCache;

  const res = await fetch('/area-data', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao obter /area-data');

  const data = await res.json();

  
  let min = Infinity;
  let max = -Infinity;

  for (const d of data) {
    const y = Number(d?.year);
    if (Number.isFinite(y)) {
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('Dataset sem anos válidos em /area-data');
  }

  _yearBoundsCache = { minYear: min, maxYear: max };
  return _yearBoundsCache;
}


// ---- Mapa ----
async function loadMap() {
  try {
    const srtmResponse = await fetch('/srtm-url');
    const srtmData = await srtmResponse.json();

    if (L.DomUtil.get('map') !== null) {
      L.DomUtil.get('map')._leaflet_id = null;
    }

    const map = L.map('map').setView([-3.4653, -62.2159], 6);

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OpenStreetMap' });
    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { attribution: 'CartoDB Dark' });
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'ESRI Satellite' });

    dark.addTo(map);

    const srtmLayer = L.tileLayer(srtmData.url, { attribution: 'Earth Engine', opacity: 0.9 });
    srtmLayer.addTo(map);

    let municipiosLayer;

    function style() {
      return {
        color: '#FFFFFF',
        weight: 0.5,
        opacity: 0.2,
        fillOpacity: 0.0
      };
    }

    function highlightFeature(e) {
      const layer = e.target;
      layer.setStyle({
        color: '#FF6D00',
        weight: 2,
        opacity: 1.0,
        fillOpacity: 0.1
      });
      layer.bringToFront();

      if (!layer.tooltip) {
        const props = e.target.feature.properties;
layer.tooltip = L.tooltip({
  permanent: false,
  direction: 'top',
  className: 'custom-tooltip'
})
  .setContent(`<strong>${toTitleCasePt(props.NM_MUN)}</strong><br>${toTitleCasePt(props.NM_UF)}`)
  .setLatLng(e.latlng);

        layer.tooltip.addTo(map);
      }
    }

    function resetHighlight(e) {
      if (municipiosLayer) municipiosLayer.resetStyle(e.target);
      if (e.target.tooltip) {
        map.removeLayer(e.target.tooltip);
        e.target.tooltip = null;
      }
    }

    function onEachFeature(feature, layer) {
      layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: async () => {
          showLoader();
          const props = feature.properties;
          const municipio = props.NM_MUN;
          const state = props.NM_UF;

          const stateFilter = document.getElementById('stateFilter');
          const municipioFilter = document.getElementById('municipioFilter');

          stateFilter.value = state;
          await loadMunicipioFilter(state);
          municipioFilter.value = municipio;

          await applyYearFilter(); 
          hideLoader();
        }
      });
    }

    municipiosLayer = L.geoJSON(null, { style, onEachFeature });

    const geojsonResponse = await fetch('/municipios-amazonia');
    const geojsonData = await geojsonResponse.json();
    municipiosLayer.addData(geojsonData);
    municipiosLayer.addTo(map);

    const baseMaps = { 'OpenStreetMap': osm, 'Dark': dark, 'Satellite': satellite };
    const overlayMaps = {
      'FLORESER 2024': srtmLayer,
      'Municípios da Amazônia Legal': municipiosLayer
    };

    L.control.layers(baseMaps, overlayMaps, {
      collapsed: true,
      position: 'topright'
    }).addTo(map);

    L.control.scale({
      imperial: false,
      position: 'bottomleft'
    }).addTo(map);

  } catch (error) {
    console.error('Erro ao carregar o mapa:', error);
  } finally {
    hideLoader();
  }
}
async function loadStateFilter() {
  try {
    showLoader();
    const response = await fetch('/lista-estados', { cache: 'no-store' });
    if (!response.ok) throw new Error('Erro na requisição');
    let states = await response.json();

    
    states = Array.from(new Set(states))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    const stateFilter = document.getElementById('stateFilter');
    stateFilter.innerHTML = '';

    
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = 'Todos os Estados';
    stateFilter.appendChild(optAll);

    
    const optAL = document.createElement('option');
    optAL.value = '__AMAZONIA_LEGAL__';
    optAL.textContent = 'Amazônia Legal';
    stateFilter.appendChild(optAL);

    
    states.forEach(state => {
      const option = document.createElement('option');
      option.value = state;                      // valor bruto para casar com backend
      option.textContent = toTitleCasePt(state);
      stateFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Erro ao carregar os estados:', error);
    const stateFilter = document.getElementById('stateFilter');
    if (stateFilter) {
      stateFilter.innerHTML = `<option value="">Todos os Estados</option>
                               <option value="__AMAZONIA_LEGAL__">Amazônia Legal</option>`;
    }
    showWarningModal(
      'Não foi possível carregar os Estados',
      'Verifique se a rota <code>/lista-estados</code> está ativa, se não há bloqueio de CORS e se o protocolo (http/https) coincide com o da página.'
    );
  } finally {
    hideLoader();
  }
}

async function loadMunicipioFilter(state) {
  try {
    showLoader();
    const response = await fetch(`/lista-municipios/${encodeURIComponent(state)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Erro na requisição');
    let municipios = await response.json();

    
    municipios = Array.from(new Set(municipios))
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    const municipioFilter = document.getElementById('municipioFilter');
    municipioFilter.innerHTML = '<option value="">Todos os Municípios</option>';
    municipios.forEach(municipio => {
      const option = document.createElement('option');
      option.value = municipio;                         
      option.textContent = toTitleCasePt(municipio);    
      municipioFilter.appendChild(option);
    });
  } catch (error) {
    console.error('Erro ao carregar os municípios:', error);
    const municipioFilter = document.getElementById('municipioFilter');
    if (municipioFilter) {
      municipioFilter.innerHTML = '<option value="">Todos os Municípios</option>';
    }
  } finally {
    hideLoader();
  }
}


let applyYearFilterPending = false;     
async function applyYearFilter() {
  if (isApplyingYearFilter) {
    applyYearFilterPending = true;
    return;
  }
  isApplyingYearFilter = true;

  try {
    showLoader();

    let state     = document.getElementById('stateFilter')?.value || '';
    const municipio = document.getElementById('municipioFilter')?.value || '';

    
    if (state === '__AMAZONIA_LEGAL__') state = '';

    let { startYear, endYear } = getYearFilters();
    const { minYear, maxYear } = await getDataYearBounds();

    if (endYear === null) endYear = maxYear;

    const msgs = [];
    let adjusted = false;
    if (endYear > maxYear) { msgs.push(`Ano final (${endYear}) ajustado para <strong>${maxYear}</strong>.`); endYear = maxYear; adjusted = true; }
    if (startYear > maxYear) { msgs.push(`Ano inicial (${startYear}) sem dados; ajustado para <strong>${maxYear}</strong>.`); startYear = maxYear; adjusted = true; }
    if (startYear < minYear) { msgs.push(`Ano inicial (${startYear}) ajustado para <strong>${minYear}</strong>.`); startYear = minYear; adjusted = true; }
    if (startYear > endYear) { msgs.push(`Intervalo inválido (${startYear}-${endYear}); ajustado para <strong>${endYear}</strong>.`); startYear = endYear; adjusted = true; }

    if (adjusted) {
      showWarningModal('Ajuste de período',
        `Os anos escolhidos foram ajustados aos limites do dataset:<br>${msgs.join('<br>')}`);
    }

    if (municipio) {
      await loadChartByState(state, municipio, startYear, endYear);
    } else if (state) {
      await loadChartByState(state, '', startYear, endYear);
      await loadMunicipioChartByMunicipio(state, startYear, endYear);
    } else {
      await loadChartByState('', '', startYear, endYear);
      await loadMunicipioChartByMunicipio('', startYear, endYear);
    }

  } catch (e) {
    console.error('Erro ao aplicar filtro de ano:', e);
  } finally {
    hideLoader();
    isApplyingYearFilter = false;
    if (applyYearFilterPending) {
      applyYearFilterPending = false;
      applyYearFilter();
    }
  }
}



function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    compactDisplay: 'short'
  }).format(value);
}

// ---- Charts ----

async function loadChartByState(state = '', municipio = '', startYear = 1986, endYear = 2024) {
  try {
    const response = await fetch('/area-data', { cache: 'no-store' });
    const raw = await response.json();


    const data = raw.map(d => ({
      state: d.state,
      name: d.name,
      year: Number(d.year),                 
      area: Number(d.area) || 0
    })).filter(d => Number.isFinite(d.year));

    
    const byYears = data.filter(d => d.year >= startYear && d.year <= endYear);

    
    const labels = [];
    for (let y = startYear; y <= endYear; y++) labels.push(y);

    let datasets = [];

    if (municipio) {
    
      const muniRows = byYears.filter(d => eqStr(d.name, municipio));

    
      const areaByYear = new Map();
      for (const r of muniRows) {
        areaByYear.set(r.year, (areaByYear.get(r.year) || 0) + r.area);
      }

      datasets = [{
        label: toTitleCasePt(municipio),
        data: labels.map(y => areaByYear.get(y) || 0),
        backgroundColor: chartColors[0],
        borderColor: chartBorders[0],
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6
      }];

    } else if (state) {
    
      const stateRows = byYears.filter(d => eqStr(d.state, state));

      const areaByYear = new Map();
      for (const r of stateRows) {
        areaByYear.set(r.year, (areaByYear.get(r.year) || 0) + r.area);
      }

      datasets = [{
        label: toTitleCasePt(state),
        data: labels.map(y => areaByYear.get(y) || 0),
        backgroundColor: chartColors[0],
        borderColor: chartBorders[0],
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6
      }];

    } else {
      const uniqueStates = Array.from(new Set(byYears.map(d => d.state)))
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

      datasets = uniqueStates.map((st, idx) => {
        const rows = byYears.filter(d => eqStr(d.state, st));

        const areaByYear = new Map();
        for (const r of rows) {
          areaByYear.set(r.year, (areaByYear.get(r.year) || 0) + r.area);
        }

        return {
          label: toTitleCasePt(st),
          data: labels.map(y => areaByYear.get(y) || 0),
          backgroundColor: chartColors[idx % chartColors.length],
          borderColor: chartBorders[idx % chartBorders.length],
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 5
        };
      });
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: "'Montserrat', sans-serif", size: 12 },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        title: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          titleColor: '#212121',
          bodyColor: '#212121',
          borderColor: '#ddd',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          boxPadding: 6,
          titleFont: { family: "'Montserrat', sans-serif", size: 14, weight: 'bold' },
          bodyFont: { family: "'Montserrat', sans-serif", size: 13 },
          callbacks: {
            label: function (ctx) {
              let label = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
              if (ctx.parsed.y != null) label += formatNumber(ctx.parsed.y) + ' ha';
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category',
          grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
          ticks: { font: { family: "'Montserrat', sans-serif", size: 12 } },
          title: { display: true, text: 'Ano', font: { family: "'Montserrat'", size: 14, weight: 'bold' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            font: { family: "'Montserrat', sans-serif", size: 12 },
            callback: v => formatCompactNumber(v)
          },
          title: { display: true, text: 'Área (ha)', font: { family: "'Montserrat'", size: 14, weight: 'bold' } }
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' },
      hover: { mode: 'index', intersect: false },
      interaction: { mode: 'index', intersect: false }
    };

    destroyChart(areaChartInstance);
    destroyChart(areaChartLargeInstance);

    areaChartInstance = new Chart(document.getElementById('areaChart'), {
      type: 'line',
      data: { labels, datasets },
      options: chartOptions
    });

    areaChartLargeInstance = new Chart(document.getElementById('areaChartLarge'), {
      type: 'line',
      data: { labels, datasets },
      options: { ...chartOptions, maintainAspectRatio: false }
    });

    const modalTitle = document.querySelector('#modalAreaChart .modal-title');
    if (modalTitle) {
      modalTitle.textContent = municipio
        ? `Série Temporal (${startYear}-${endYear}) - ${toTitleCasePt(municipio)}`
        : state
          ? `Série Temporal (${startYear}-${endYear}) - ${toTitleCasePt(state)}`
          : `Série Temporal por Estado (${startYear}-${endYear})`;
    }

  } catch (error) {
    console.error('Erro ao carregar gráfico por estado:', error);
  } finally {
    hideLoader();
  }
}

async function loadMunicipioChartByMunicipio  (state = '', startYear = 1986, endYear = 2024) {
  try {
    const response = await fetch(`/municipios-area-data?startYear=${startYear}&endYear=${endYear}`, { cache: 'no-store' });
    const data = await response.json();

    const filteredData = state ? data.filter(item => item.state === state) : data;

    const top10 = filteredData
      .sort((a, b) => b.area - a.area)
      .slice(0, 10);

    const greenBase = [27, 94, 32];
    const greenColors = [];
    const borderColors = [];

    for (let i = 0; i < top10.length; i++) {
      const intensity = 0.5 + (i * 0.05);
      const r = Math.min(255, Math.round(greenBase[0] * intensity));
      const g = Math.min(255, Math.round(greenBase[1] * intensity * 1.1));
      const b = Math.min(255, Math.round(greenBase[2] * intensity * 0.9));
      greenColors.push(`rgba(${r}, ${g}, ${b}, 0.8)`);
      borderColors.push(`rgba(${r}, ${g}, ${b}, 1)`);
    }

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          titleColor: '#212121',
          bodyColor: '#212121',
          borderColor: '#ddd',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: "'Montserrat', sans-serif", size: 14, weight: 'bold' },
          bodyFont: { family: "'Montserrat', sans-serif", size: 13 },
          callbacks: {
            label: function (context) {
              let label = 'Área: ';
              if (context.parsed.x !== null) {
                label += formatNumber(context.parsed.x) + ' ha';
              }
              return label;
            },
            afterLabel: function (context) {
              const index = context.dataIndex;
              const rank = index + 1;
              return `Posição: ${rank}º`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            font: { family: "'Montserrat', sans-serif", size: 12 },
            callback: value => formatCompactNumber(value)
          },
          title: { display: true, text: 'Área de Vegetação Secundária (ha)', font: { family: "'Montserrat'", size: 14, weight: 'bold' } }
        },
        y: {
          grid: { display: false },
          ticks: {
            font: { family: "'Montserrat', sans-serif", size: 12 },
            callback: function (value) {
              const municipio = this.getLabelForValue(value);
              return municipio.length > 30 ? municipio.substring(0, 27) + '...' : municipio;
            }
          },
          title: { display: true, text: 'Municípios', font: { family: "'Montserrat'", size: 14, weight: 'bold' } }
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    };

    destroyChart(municipioChartInstance);
    destroyChart(municipioChartLargeInstance);

    const labels = top10.map(item => item.municipio);
    const series = top10.map(item => item.area);

    municipioChartInstance = new Chart(document.getElementById('municipioChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Área Acumulada', data: series, backgroundColor: greenColors, borderColor: borderColors, borderWidth: 1, borderRadius: 4 }] },
      options: chartOptions
    });

    municipioChartLargeInstance = new Chart(document.getElementById('municipioChartLarge'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Área Acumulada', data: series, backgroundColor: greenColors, borderColor: borderColors, borderWidth: 1, borderRadius: 4 }] },
      options: { ...chartOptions, maintainAspectRatio: false }
    });

    const modalTitle = document.querySelector('#modalMunicipioChart .modal-title');
    if (modalTitle) modalTitle.textContent = '';

  } catch (error) {
    console.error('Erro ao carregar gráfico dos municípios:', error);
  } finally {
    hideLoader();
  }
}

// ---- Eventos ----
document.getElementById('stateFilter').addEventListener('change', async function () {
  const state = this.value;
  const municipioFilter = document.getElementById('municipioFilter');

  if (!state) {
    // Todos os Estados
    if (municipioFilter) {
      municipioFilter.innerHTML = '<option value="">Todos os Municípios</option>';
    }
  } else if (state === '__AMAZONIA_LEGAL__') {
    // Amazônia Legal 
    if (municipioFilter) {
      municipioFilter.innerHTML = '<option value="">Todos os Municípios</option>';
    }
  } else {
    
    await loadMunicipioFilter(state);
  }

  await applyYearFilter(); 
});


document.getElementById('municipioFilter').addEventListener('change', async function () {
  await applyYearFilter();
});

document.getElementById('applyYearFilter').addEventListener('click', applyYearFilter);

// ===== Downloads FloreSer =====
const FLORESER_GEOJSON_BASE = '/dataset/floreser/geojson';
const FLORESER_CSV_BASE = '/dataset/floreser/csv';
const FLORESER_SHP_BASE = '/dataset/floreser/shp';
let FLORESER_SELECTED_TYPE = 'geojson';

function floreserAnnualUrl(year, type = FLORESER_SELECTED_TYPE) {
  if (type === 'geojson') return `${FLORESER_GEOJSON_BASE}/floreser_${year}.geojson`;
  if (type === 'csv') return `${FLORESER_CSV_BASE}/floreser_${year}.csv`;
  return `${FLORESER_SHP_BASE}/floreser_${year}.zip`;
}

function makeChipFloreser(label, url) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'chiplink';
  a.textContent = label;
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  li.appendChild(a);
  return li;
}

async function buildFloreserYearBlock(year) {
  const details = document.createElement('details');
  details.open = false;
  
  const summary = document.createElement('summary');
  summary.innerHTML = `<span class="year">${year}</span>`;
  details.appendChild(summary);

  const formats = document.createElement('div');
  formats.className = 'format-wrap';
  
  const fAnnual = document.createElement('div');
  fAnnual.className = 'format-card';
  
  const titleKind = FLORESER_SELECTED_TYPE === 'geojson' ? 'GeoJSON anual' :
                   FLORESER_SELECTED_TYPE === 'csv' ? 'CSV anual' : 
                   'Shapefile anual (ZIP)';
  
  fAnnual.innerHTML = `<div class="format-title">${titleKind}</div>`;
  
  const list = document.createElement('ul');
  list.className = 'chiplist';
  
  const label = `Baixar ${year}`;
  const url = floreserAnnualUrl(year);
  list.appendChild(makeChipFloreser(label, url));
  
  fAnnual.appendChild(list);
  formats.appendChild(fAnnual);
  details.appendChild(formats);
  return details;
}

async function renderDownloadsFloreSer() {
  const ul = document.getElementById('floreser-downloads-list');
  ul.innerHTML = '';
  
  const currentYear = new Date().getFullYear();
  // FloreSer geralmente tem dados de 1986 em diante
  for (let year = currentYear; year >= 1986; year--) {
    const blk = await buildFloreserYearBlock(year);
    const li = document.createElement('li');
    li.appendChild(blk);
    ul.appendChild(li);
  }
}

// Inicialização dos downloads FloreSer
function initializeFloreSerDownloads() {
  const downloadCard = document.getElementById('downloads-floreser-card');
  const toggleBtn = document.getElementById('downloads-floreser-toggle');
  const listEl = document.getElementById('floreser-downloads-list');

  if (!downloadCard || !toggleBtn || !listEl) return;

  // Evento para expandir/recolher
  toggleBtn.addEventListener('click', async () => {
    const collapsed = downloadCard.classList.toggle('collapsed');
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));

    // Se abriu e não tem anos renderizados, renderiza agora
    const needsRender = !collapsed && (
      !listEl.children.length ||
      (listEl.children.length === 1 && listEl.querySelector('.muted'))
    );
    if (needsRender) {
      await renderDownloadsFloreSer();
    }
  });

  // Evento para trocar tipo de arquivo
  document.querySelector('#floreser-typebar').addEventListener('click', async (e) => {
    const btn = e.target.closest('.typebtn');
    if (!btn) return;

    document.querySelectorAll('#floreser-typebar .typebtn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });

    FLORESER_SELECTED_TYPE = btn.dataset.type;
    await renderDownloadsFloreSer();
  });

  // Render inicial (conteúdo pronto quando possível)
  renderDownloadsFloreSer().catch(() => {});
}

// ---- Inicialização ----
window.addEventListener('DOMContentLoaded', async () => {
  const endYearEl = document.getElementById('endYear');
  if (endYearEl) {
    endYearEl.value = String(new Date().getFullYear() - 1);
  }
  showLoader();
  await loadStateFilter();
  await loadMap();
  await applyYearFilter();
  
  // Inicializar downloads FloreSer
  initializeFloreSerDownloads();
  
  hideLoader();
});