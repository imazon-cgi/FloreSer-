let areaChartInstance;
let municipioChartInstance;
let areaChartLargeInstance;
let municipioChartLargeInstance;


const chartColors = [
  'rgba(27, 94, 32, 0.8)',    // Verde primário
  'rgba(0, 121, 107, 0.8)',   // Verde-azulado
  'rgba(255, 109, 0, 0.8)',   // Laranja accent
  'rgba(21, 101, 192, 0.8)',  // Azul
  'rgba(94, 53, 177, 0.8)',   // Roxo
  'rgba(183, 28, 28, 0.8)',   // Vermelho
  'rgba(0, 150, 136, 0.8)',   // Teal
  'rgba(255, 152, 0, 0.8)',   // Laranja
  'rgba(63, 81, 181, 0.8)',   // Indigo
  'rgba(156, 39, 176, 0.8)'   // Roxo
];

// Configurações de bordas para os gráficos
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

// Função para mostrar o loader
function showLoader() {
  document.getElementById('loader').style.display = 'flex';
}

// Função para esconder o loader
function hideLoader() {
  document.getElementById('loader').style.display = 'none';
}

// Função para destruir gráficos existentes antes de criar novos
function destroyChart(chartInstance) {
  if (chartInstance) {
    chartInstance.destroy();
  }
}

// Função para obter os valores dos filtros de ano
function getYearFilters() {
  const startYear = parseInt(document.getElementById('startYear').value) || 2008;
  const endYear = parseInt(document.getElementById('endYear').value) || 2023;
  return { startYear, endYear };
}

async function loadMap() {
    try {
      const srtmResponse = await fetch('/srtm-url');
      const srtmData = await srtmResponse.json();
  
      // Verifica se o mapa já existe e remove para evitar duplicação
      if (L.DomUtil.get('map') !== null) {
        L.DomUtil.get('map')._leaflet_id = null;
      }
  
      const map = L.map('map').setView([-3.4653, -62.2159], 6);
  
      // Camadas base
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OpenStreetMap' });
      const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { attribution: 'CartoDB Dark' });
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'ESRI Satellite' });
  
      dark.addTo(map);
  
      // Camada SRTM
      const srtmLayer = L.tileLayer(srtmData.url, { attribution: 'Earth Engine', opacity: 0.9 });
      srtmLayer.addTo(map);
  
      // Função para estilizar a camada de municípios
      function style(feature) {
        return {
          color: '#FFFFFF',       // Cor da borda branca
          weight: 0.5,              // Largura da linha
          opacity: 0.2,           // Opacidade da borda
          fillOpacity: 0.0       // Preenchimento transparente
        };
      }
  
      // Função para realçar o município ao passar o mouse
      function highlightFeature(e) {
        const layer = e.target;
        layer.setStyle({
          color: '#FF0000',      // Realce em vermelho
          weight: 1.5,
          opacity: 1.0,
          fillOpacity: 0.0
        });
        layer.bringToFront();
      }
  
      // Função para redefinir o estilo após o mouse sair
      function resetHighlight(e) {
        municipiosLayer.resetStyle(e.target);
      }

    // Função para estilizar a camada de municípios
    function style(feature) {
      return {
        color: '#FFFFFF',
        weight: 0.5,
        opacity: 0.2,
        fillOpacity: 0.0
      };
    }

    // Função para realçar o município ao passar o mouse
    function highlightFeature(e) {
      const layer = e.target;
      layer.setStyle({
        color: '#FF6D00',  // Cor de destaque (accent color)
        weight: 2,
        opacity: 1.0,
        fillOpacity: 0.1
      });
      layer.bringToFront();
      
      // Adicionar tooltip com o nome do município
      if (!layer.tooltip) {
        const props = e.target.feature.properties;
        layer.tooltip = L.tooltip({
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip'
        })
        .setContent(`<strong>${props.NM_MUN}</strong><br>${props.NM_UF}`)
        .setLatLng(e.latlng);
        layer.tooltip.addTo(map);
      }
    }

    // Função para redefinir o estilo após o mouse sair
    function resetHighlight(e) {
      municipiosLayer.resetStyle(e.target);
      
      // Remover tooltip
      if (e.target.tooltip) {
        map.removeLayer(e.target.tooltip);
        e.target.tooltip = null;
      }
    }

    // Função para clicar no município e atualizar os gráficos
    function onEachFeature(feature, layer) {
      layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: async (e) => {
          showLoader();
          const props = feature.properties;
          const municipio = props.NM_MUN;
          const state = props.NM_UF;

          // Atualiza os filtros no HTML
          const stateFilter = document.getElementById('stateFilter');
          const municipioFilter = document.getElementById('municipioFilter');

          // Define o estado e o município nos filtros
          stateFilter.value = state;
          await loadMunicipioFilter(state); // Atualiza a lista de municípios
          municipioFilter.value = municipio;

          // Obter os anos selecionados
          const { startYear, endYear } = getYearFilters();

          // Atualizar os gráficos com os dados do município clicado
          await loadChartByState(state, municipio, startYear, endYear); 
          await loadMunicipioChartByMunicipio(state, startYear, endYear);
          hideLoader();
        }
      });
    }

    // Carregar camada de municípios da Amazônia Legal
    const municipiosLayer = L.geoJSON(null, {
      style: style,
      onEachFeature: onEachFeature
    });

    // Buscar o GeoJSON do backend
    const geojsonResponse = await fetch('/municipios-amazonia');
    const geojsonData = await geojsonResponse.json();
    municipiosLayer.addData(geojsonData);
    municipiosLayer.addTo(map);

    const baseMaps = { 'OpenStreetMap': osm, 'Dark': dark, 'Satellite': satellite };
    const overlayMaps = {
      'SerFlor 2023': srtmLayer,
      'Municípios da Amazônia Legal': municipiosLayer
    };
    
    // Adicionar controles com estilo personalizado
    L.control.layers(baseMaps, overlayMaps, {
      collapsed: false,
      position: 'topright'
    }).addTo(map);
    
    // Adicionar escala
    L.control.scale({
      imperial: false,
      position: 'bottomleft'
    }).addTo(map);
    
    hideLoader();
  } catch (error) {
    console.error('Erro ao carregar o mapa:', error);
    hideLoader();
  }
}

// Função para carregar o filtro de estados
async function loadStateFilter() {
  try {
    showLoader();
    const response = await fetch('/lista-estados');
    if (!response.ok) throw new Error('Erro na requisição');
    const states = await response.json();
    const stateFilter = document.getElementById('stateFilter');
    states.forEach(state => {
      const option = document.createElement('option');
      option.value = state;
      option.textContent = state;
      stateFilter.appendChild(option);
    });
    hideLoader();
  } catch (error) {
    console.error('Erro ao carregar os estados:', error);
    hideLoader();
  }
}

// Função para carregar o filtro de municípios
async function loadMunicipioFilter(state) {
  try {
    showLoader();
    const response = await fetch(`/lista-municipios/${state}`);
    if (!response.ok) throw new Error('Erro na requisição');
    const municipios = await response.json();
    const municipioFilter = document.getElementById('municipioFilter');
    municipioFilter.innerHTML = '<option value="">Todos os Municípios</option>';
    municipios.forEach(municipio => {
      const option = document.createElement('option');
      option.value = municipio;
      option.textContent = municipio;
      municipioFilter.appendChild(option);
    });
    hideLoader();
  } catch (error) {
    console.error('Erro ao carregar os municípios:', error);
    hideLoader();
  }
}

// Função para atualizar os gráficos com os filtros aplicados
function applyYearFilter() {
  showLoader();
  const state = document.getElementById('stateFilter').value;
  const municipio = document.getElementById('municipioFilter').value;
  const { startYear, endYear } = getYearFilters();

  if (municipio) {
    loadChartByState(state, municipio, startYear, endYear);
  } else if (state) {
    loadChartByState(state, '', startYear, endYear);
    loadMunicipioChartByMunicipio(state, startYear, endYear);
  } else {
    loadChartByState('', '', startYear, endYear);
    loadMunicipioChartByMunicipio('', startYear, endYear);
  }
}

// Função para formatar números
function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Função para formatar números compactos
function formatCompactNumber(value) {
  return new Intl.NumberFormat('pt-BR', { 
    notation: 'compact',
    compactDisplay: 'short'
  }).format(value);
}

// Função para carregar o gráfico por estado
async function loadChartByState(state = '', municipio = '', startYear = 2008, endYear = 2023) {
  try {
    const response = await fetch('/area-data');
    const data = await response.json();

    // Filtrar os dados pelo estado, município e intervalo de anos
    let filteredData;
    if (municipio) {
      filteredData = data.filter(item =>
        item.name === municipio &&
        item.year >= startYear &&
        item.year <= endYear
      );
    } else if (state) {
      filteredData = data.filter(item =>
        item.state === state &&
        item.year >= startYear &&
        item.year <= endYear
      );
    } else {
      filteredData = data.filter(item =>
        item.year >= startYear &&
        item.year <= endYear
      );
    }

    // Verifica se é para exibir a série de um município específico
    const years = [...new Set(filteredData.map(item => item.year))].sort();
    let labels, datasets;

    if (municipio) {
      // Série histórica para um único município
      labels = years;
      const municipioData = filteredData.filter(item => item.name === municipio);
      datasets = [{
        label: municipio,
        data: years.map(year => {
          const entry = municipioData.find(item => item.year === year);
          return entry ? entry.area : 0;
        }),
        backgroundColor: chartColors[0],
        borderColor: chartBorders[0],
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 50
      }];
    } else if (state) {
      // Série acumulada para o estado
      labels = years;
      const stateData = filteredData;
      datasets = [{
        label: state,
        data: years.map(year => {
          const entry = stateData.find(item => item.year === year);
          return entry ? entry.area : 0;
        }),
        backgroundColor: chartColors[0],
        borderColor: chartBorders[0],
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 50
      }];
    } else {
      // Série acumulada para todos os estados
      labels = [...new Set(filteredData.map(item => item.state))];
      datasets = labels.map((label, index) => {
        const stateData = filteredData.filter(item => item.state === label);
        return {
          label: label,
          data: years.map(year => {
            const entry = stateData.find(item => item.year === year);
            return entry ? entry.area : 0;
          }),
          backgroundColor: chartColors[index % chartColors.length],
          borderColor: chartBorders[index % chartBorders.length],
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 50
        };
      });
    }

    // Configurações comuns para os gráficos
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: 'top',
          labels: {
            font: {
              family: "'Montserrat', sans-serif",
              size: 12
            },
            padding: 15,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        title: {
          display: true,
          text: municipio ?
            `Área Acumulada (${startYear}-${endYear}) - ${municipio}` :
            state ?
              `Área Acumulada (${startYear}-${endYear}) - ${state}` :
              `Área Acumulada por Estado (${startYear}-${endYear})`,
          font: {
            family: "'Montserrat', sans-serif",
            size: 16,
            weight: 'bold'
          },
          padding: {
            top: 10,
            bottom: 20
          }
        },
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
          titleFont: {
            family: "'Montserrat', sans-serif",
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            family: "'Montserrat', sans-serif",
            size: 13
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += formatNumber(context.parsed.y) + ' ha';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: "'Montserrat', sans-serif",
              size: 12
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            font: {
              family: "'Montserrat', sans-serif",
              size: 12
            },
            callback: function(value) {
              return formatCompactNumber(value);
            }
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      },
      hover: {
        mode: 'index',
        intersect: false
      }
    };

    // Destruir gráficos anteriores
    destroyChart(areaChartInstance);
    destroyChart(areaChartLargeInstance);

    // Criar os novos gráficos
    areaChartInstance = new Chart(document.getElementById('areaChart'), {
      type: 'bar',
      data: { labels: years, datasets: datasets },
      options: chartOptions
    });

    areaChartLargeInstance = new Chart(document.getElementById('areaChartLarge'), {
      type: 'bar',
      data: { labels: years, datasets: datasets },
      options: {
        ...chartOptions,
        maintainAspectRatio: false
      }
    });

    // Atualizar o título do modal
    document.querySelector('#modalAreaChart .modal-title').textContent = chartOptions.plugins.title.text;

    hideLoader();
  } catch (error) {
    console.error('Erro ao carregar gráfico por estado:', error);
    hideLoader();
  }
}

// Função para carregar o gráfico por município
async function loadMunicipioChartByMunicipio(state = '', startYear = 2008, endYear = 2023) {
  try {
    const response = await fetch(`/municipios-area-data?startYear=${startYear}&endYear=${endYear}`);
    const data = await response.json();

    // Se um estado estiver selecionado, filtra os dados, caso contrário, mostra todos
    const filteredData = state ? data.filter(item => item.state === state) : data;

    // Ordenar e pegar os 10 municípios com maior área acumulada
    const top10 = filteredData
      .sort((a, b) => b.area - a.area)
      .slice(0, 10);

    // Configurações para o gráfico
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { 
          display: false
        },
        title: { 
          display: true, 
          text: state ? 
            `Top 10 Municípios (${startYear}-${endYear}) - ${state}` : 
            `Top 10 Municípios (${startYear}-${endYear}) - Geral`,
          font: {
            family: "'Montserrat', sans-serif",
            size: 16,
            weight: 'bold'
          },
          padding: {
            top: 10,
            bottom: 20
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          titleColor: '#212121',
          bodyColor: '#212121',
          borderColor: '#ddd',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: {
            family: "'Montserrat', sans-serif",
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            family: "'Montserrat', sans-serif",
            size: 13
          },
          callbacks: {
            label: function(context) {
              let label = 'Área: ';
              if (context.parsed.x !== null) {
                label += formatNumber(context.parsed.x) + ' ha';
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            font: {
              family: "'Montserrat', sans-serif",
              size: 12
            },
            callback: function(value) {
              return formatCompactNumber(value);
            }
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: "'Montserrat', sans-serif",
              size: 12
            }
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart'
      }
    };

    // Destruir gráficos anteriores
    destroyChart(municipioChartInstance);
    destroyChart(municipioChartLargeInstance);

    // Criar os novos gráficos
    municipioChartInstance = new Chart(document.getElementById('municipioChart'), {
      type: 'bar',
      data: {
        labels: top10.map(item => item.municipio),
        datasets: [{
          label: 'Área Acumulada',
          data: top10.map(item => item.area),
          backgroundColor: top10.map((_, index) => chartColors[index % chartColors.length]),
          borderColor: top10.map((_, index) => chartBorders[index % chartBorders.length]),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: chartOptions
    });

    municipioChartLargeInstance = new Chart(document.getElementById('municipioChartLarge'), {
      type: 'bar',
      data: {
        labels: top10.map(item => item.municipio),
        datasets: [{
          label: 'Área Acumulada',
          data: top10.map(item => item.area),
          backgroundColor: top10.map((_, index) => chartColors[index % chartColors.length]),
          borderColor: top10.map((_, index) => chartBorders[index % chartBorders.length]),
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        ...chartOptions,
        maintainAspectRatio: false
      }
    });

    // Atualizar o título do modal
    document.querySelector('#modalMunicipioChart .modal-title').textContent = chartOptions.plugins.title.text;

    hideLoader();
  } catch (error) {
    console.error('Erro ao carregar gráfico dos municípios:', error);
    hideLoader();
  }
}

// Evento para carregar municípios ao selecionar estado
document.getElementById('stateFilter').addEventListener('change', async function() {
  const state = this.value;
  if (state) {
    await loadMunicipioFilter(state);
    await loadChartByState(state);
    await loadMunicipioChartByMunicipio(state);
  } else {
    // Se nenhum estado for selecionado, carrega todos os dados
    document.getElementById('municipioFilter').innerHTML = '<option value="">Todos os Municípios</option>';
    await loadChartByState();
    await loadMunicipioChartByMunicipio();
  }
});

// Evento para carregar gráfico ao selecionar município
document.getElementById('municipioFilter').addEventListener('change', function() {
  const municipio = this.value;
  const state = document.getElementById('stateFilter').value;
  const { startYear, endYear } = getYearFilters();

  if (municipio) {
    loadChartByState(state, municipio, startYear, endYear);
  } else if (state) {
    loadChartByState(state, '', startYear, endYear);
    loadMunicipioChartByMunicipio(state, startYear, endYear);
  } else {
    loadChartByState('', '', startYear, endYear);
    loadMunicipioChartByMunicipio('', startYear, endYear);
  }
});

// Evento para aplicar filtro de ano
document.getElementById('applyYearFilter').addEventListener('click', applyYearFilter);

// Inicialização da página
window.addEventListener('DOMContentLoaded', () => {
  // Mostrar loader durante o carregamento inicial
  showLoader();
  
  // Carregar dados iniciais
  loadStateFilter();
  loadMap();
  loadChartByState();
  loadMunicipioChartByMunicipio();
});

