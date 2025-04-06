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
  
   // Função para clicar no município e atualizar os gráficos
function onEachFeature(feature, layer) {
    layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: async (e) => {
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
      L.control.layers(baseMaps, overlayMaps).addTo(map);
    } catch (error) {
      console.error('Erro ao carregar o mapa:', error);
    }
  }
  
  
  async function loadStateFilter() {
    try {
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
    } catch (error) {
      console.error('Erro ao carregar os estados:', error);
    }
  }
  
  async function loadMunicipioFilter(state) {
    try {
      const response = await fetch(`/lista-municipios/${state}`);
      if (!response.ok) throw new Error('Erro na requisição');
      const municipios = await response.json();
      const municipioFilter = document.getElementById('municipioFilter');
      municipioFilter.innerHTML = '<option value="">Selecione o Município</option>';
      municipios.forEach(municipio => {
        const option = document.createElement('option');
        option.value = municipio;
        option.textContent = municipio;
        municipioFilter.appendChild(option);
      });
    } catch (error) {
      console.error('Erro ao carregar os municípios:', error);
    }
  }
  
  
  // Evento para carregar municípios ao selecionar estado
  document.getElementById('stateFilter').addEventListener('change', async function() {
    const state = this.value;
    if (state) {
      await loadMunicipioFilter(state);
      await loadChartByState(state);
    }
  });
  
  // Evento para carregar gráfico ao selecionar município
  document.getElementById('municipioFilter').addEventListener('change', function() {
    const municipio = this.value;
    if (municipio) {
      loadMunicipioChartByMunicipio(municipio);
    }
  });
  
  
  // Função para obter os anos selecionados ou retornar os valores padrão
function getSelectedYears() {
    const startYear = parseInt(document.getElementById('startYear').value) || 2008;
    const endYear = parseInt(document.getElementById('endYear').value) || 2023;
    return { startYear, endYear };
}

// Função para aplicar os filtros e atualizar os gráficos
function applyYearFilter() {
    const state = document.getElementById('stateFilter').value;
    const { startYear, endYear } = getSelectedYears();
    loadChartByState(state, startYear, endYear);
    loadMunicipioChartByMunicipio(state, startYear, endYear);
}


// Atualização da função para carregar o gráfico por estado
async function loadChartByState(state = '', municipio = '', startYear = 2008, endYear = 2023) {
    try {
        const response = await fetch('/area-data');
        const data = await response.json();

        // Lógica de filtragem: Prioridade para município se estiver selecionado
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

        const years = [...new Set(filteredData.map(item => item.year))];
        const labels = municipio ? [municipio] : [...new Set(filteredData.map(item => item.state))];

        const datasets = labels.map(label => {
            const labelData = filteredData.filter(item => municipio ? item.name === label : item.state === label);
            return {
                label: label,
                data: years.map(year => {
                    const entry = labelData.find(item => item.year === year);
                    return entry ? entry.area : 0;
                }),
                borderWidth: 1
            };
        });

        // Destruir gráfico anterior
        destroyChart(areaChartInstance);

        // Criar o novo gráfico
        areaChartInstance = new Chart(document.getElementById('areaChart'), {
            type: 'bar',
            data: { labels: years, datasets: datasets },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: {
                        display: true,
                        text: municipio ? 
                            `Área Acumulada (${startYear}-${endYear}) - ${municipio}` : 
                            state ? 
                                `Área Acumulada (${startYear}-${endYear}) - ${state}` : 
                                `Área Acumulada por Estado (${startYear}-${endYear})`
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico por estado:', error);
    }
}


// Atualização da função para carregar o gráfico por município
async function loadMunicipioChartByMunicipio(state = '', startYear = 2008, endYear = 2023) {
    try {
        const response = await fetch('/municipios-area-data');
        const data = await response.json();

        // Filtrar os dados pelo estado e intervalo de anos
        const filteredData = data.filter(item => 
            (!state || item.state === state) &&
            item.year >= startYear && item.year <= endYear
        );

        // Ordenar e pegar os 10 municípios com maior área acumulada
        const top10 = filteredData
            .sort((a, b) => b.area - a.area)
            .slice(0, 10);

        // Destruir gráfico anterior, se existir
        destroyChart(municipioChartInstance);

        // Criar novo gráfico com os anos filtrados
        municipioChartInstance = new Chart(document.getElementById('municipioChart'), {
            type: 'bar',
            data: {
                labels: top10.map(item => item.municipio),
                datasets: [{
                    label: 'Área Acumulada',
                    data: top10.map(item => item.area),
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: `Top 10 Municípios (${startYear}-${endYear}) - ${state || 'Todos os Estados'}` }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico dos municípios:', error);
    }
}


// Variáveis globais para armazenar as instâncias dos gráficos
let areaChartInstance;
let municipioChartInstance;

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

// Função para atualizar os gráficos com os filtros aplicados
function applyYearFilter() {
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
        const years = [...new Set(filteredData.map(item => item.year))];
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
                borderWidth: 1
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
                borderWidth: 1
            }];
        } else {
            // Série acumulada para todos os estados
            labels = [...new Set(filteredData.map(item => item.state))];
            datasets = labels.map(label => {
                const stateData = filteredData.filter(item => item.state === label);
                return {
                    label: label,
                    data: years.map(year => {
                        const entry = stateData.find(item => item.year === year);
                        return entry ? entry.area : 0;
                    }),
                    borderWidth: 1
                };
            });
        }

        // Destruir gráfico anterior
        destroyChart(areaChartInstance);

        // Criar o novo gráfico
        areaChartInstance = new Chart(document.getElementById('areaChart'), {
            type: 'bar',
            data: { labels: years, datasets: datasets },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: {
                        display: true,
                        text: municipio ?
                            `Área Acumulada (${startYear}-${endYear}) - ${municipio}` :
                            state ?
                                `Área Acumulada (${startYear}-${endYear}) - ${state}` :
                                `Área Acumulada por Estado (${startYear}-${endYear})`
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico por estado:', error);
    }
}


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

        // Destruir gráfico anterior
        destroyChart(municipioChartInstance);

        // Criar o gráfico com os municípios filtrados
        municipioChartInstance = new Chart(document.getElementById('municipioChart'), {
            type: 'bar',
            data: {
                labels: top10.map(item => item.municipio),
                datasets: [{
                    label: 'Área Acumulada',
                    data: top10.map(item => item.area),
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { 
                        display: true, 
                        text: state ? `Top 10 Municípios (${startYear}-${endYear}) - ${state}` : `Top 10 Municípios (${startYear}-${endYear}) - Geral`
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao carregar gráfico dos municípios:', error);
    }
}


document.getElementById('municipioFilter').addEventListener('change', function() {
    const municipio = this.value;
    const state = document.getElementById('stateFilter').value;
    const { startYear, endYear } = getYearFilters();

    if (municipio) {
        loadChartByState(state, municipio, startYear, endYear);  // Mostra a série do município
    } else if (state) {
        loadChartByState(state, '', startYear, endYear);  // Mostra o estado
    } else {
        loadChartByState('', '', startYear, endYear);  // Mostra todos os estados
    }
});


  window.addEventListener('DOMContentLoaded', () => {
    const applyFilterButton = document.getElementById('applyYearFilter');
    if (applyFilterButton) {
      applyFilterButton.addEventListener('click', () => {
        const state = document.getElementById('stateFilter').value;
        const municipio = document.getElementById('municipioFilter').value;
        const { startYear, endYear } = getYearFilters();
        loadChartByState(state, municipio, startYear, endYear);
        loadMunicipioChartByMunicipio(state, startYear, endYear);
      });
    } else {
      console.error("Botão 'Aplicar Filtro' não encontrado.");
    }
  
    // Carregamento inicial com todos os dados
    loadChartByState();
    loadMunicipioChartByMunicipio();
  });
  

  

// Carregamento inicial com todos os dados
loadChartByState();
loadMunicipioChartByMunicipio();

loadStateFilter();
loadMap();


  