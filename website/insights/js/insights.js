let publicacoes = [];

/* =====================
   Carregamento de JSON
===================== */
async function carregarJSON() {
  try {
    const resposta = await fetch("../data/dataset.json");
    if (!resposta.ok) throw new Error("Erro HTTP: " + resposta.status);

    publicacoes = await resposta.json();
    console.log("Publicações carregadas:", publicacoes.length);

    atualizarDashboard();
  } catch (erro) {
    console.error("Erro ao carregar JSON:", erro);
  }
}

/* =====================
   Função para preencher listas
===================== */
function preencherLista(id, dados, formatFunc) {
  const ul = document.getElementById(id);
  if (!ul) return;
  ul.innerHTML = '';
  dados.forEach(item => {
    const li = document.createElement('li');
    li.textContent = formatFunc ? formatFunc(item) : item;
    ul.appendChild(li);
  });
}

/* =====================
   Atualização do Dashboard
===================== */
function atualizarDashboard() {
  // Top tópicos últimos 5 anos
  const topicos = topTopicos(5);
  preencherLista('listaTopicos', topicos, item => `${item[0]} — ${item[1]}`);

  // Palavras mais frequentes
  const palavras = palavrasMaisFrequentes(15);
  preencherLista('listaPalavras', palavras, item => item[0]);

  // Artigos mais citados
  const artigos = artigosMaisCitados(20);
  preencherLista('listaArtigos', artigos, item => `“${item.title}” — ${item.citation_ids.length} citações`);

  // Autores
  const autoresPub = autoresMaisPublicacoes(10);
  preencherLista('autoresPublicacoes', autoresPub, item => `${item[0]} — ${item[1]}`);

  const autoresMicro = autoresPorTopico('Microgravidade', 10);
  preencherLista('autoresPorTopico', autoresMicro, item => `${item[0]} — ${item[1]}`);

  const autoresCit = autoresMaisCitados(10);
  preencherLista('autoresMaisCitados', autoresCit, item => `${item[0]} — ${item[1]}`);

  // Instituições
  const instPub = instituicoesMaisPublicacoes(10);
  const instCit = instituicoesMaisCitacoes(10);
  preencherLista('instituicoesPublicacoes', instPub, item => `${item[0]} — ${item[1]}`);
  preencherLista('instituicoesCitacoes', instCit, item => `${item[0]} — ${item[1]}`);

  // Linha do tempo interativa
  criarLinhaDoTempo();
}

// Função para extrair apenas o nome da instituição
function limparInstituicao(nome) {
  if (!nome) return '';
  // Remove qualquer número no início
  nome = nome.replace(/^\d+\s*/, '');
  // Remove o que vem depois da vírgula (endereço, cidade, estado, país)
  nome = nome.split(',')[0].trim();
  return nome;
}

// Instituições com maior quantidade de publicações
function instituicoesMaisPublicacoes(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => {
    if (pub.affiliations) {
      Object.values(pub.affiliations).flat().forEach(inst => {
        const nomeLimpo = limparInstituicao(inst);
        freq[nomeLimpo] = (freq[nomeLimpo] || 0) + 1;
      });
    }
  });
  return ordenarObj(freq).slice(0, top);
}

// Instituições com maior quantidade de citações
function instituicoesMaisCitacoes(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => {
    const n = pub.citation_ids.length;
    if (pub.affiliations) {
      Object.values(pub.affiliations).flat().forEach(inst => {
        const nomeLimpo = limparInstituicao(inst);
        freq[nomeLimpo] = (freq[nomeLimpo] || 0) + n;
      });
    }
  });
  return ordenarObj(freq).slice(0, top);
}


/* =====================
   Linha do tempo interativa
===================== */
let chartTL;
function criarLinhaDoTempo() {
  const ctx = document.getElementById('chartPublicacoes');

  // ISSO NAO FUNCIONA AAAA
  let anos = Array.from(Object.keys(pubsPorAno()).map(a => Number(a))             // converte para número
    .filter(a => a >= 2010 && a <= 2026)).sort((a, b) => a.ano - b.ano);

  const totalAno = Object.values(pubsPorAno());
  console.log(anos)


  const topicSelect = document.getElementById('topicSelect');
  const topicFreq = {
    'Propulsão': pubPorAnoPorTopico('Propulsão'),
    'Microgravidade': pubPorAnoPorTopico('Microgravidade'),
    'Materiais': pubPorAnoPorTopico('Materiais'),
    'Radiação Cósmica': pubPorAnoPorTopico('Radiação Cósmica')
  };

  if (chartTL) chartTL.destroy();

  chartTL = new Chart(ctx, {
    type: 'line',
    data: {
      labels: anos,
      datasets: [{
        label: 'Publicações Totais',
        data: totalAno,
        borderColor: '#00a8ff',
        tension: 0.3
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: {
        x: { ticks: { color: '#aaa' }, grid: { color: '#333' } },
        y: { ticks: { color: '#aaa' }, grid: { color: '#333' } }
      }
    }
  });

  topicSelect.addEventListener('change', (e) => {
    const topic = e.target.value;
    const dataTopic = topicFreq[topic] || [];
    chartTL.data.datasets[1] = {
      label: `Tópico: ${topic}`,
      data: dataTopic,
      borderColor: '#e1b12c',
      borderDash: [5, 5],
      tension: 0.3
    };
    chartTL.update();
  });
}

/* =====================
   Estatísticas por ano
===================== */
function pubsPorAno() {
  const freq = {};
  publicacoes.forEach(pub => {
    freq[pub.year] = (freq[pub.year] || 0) + 1;
  });
  return ordenarObj(freq);
}

function pubPorAnoPorTopico(topico) {
  const freq = {};
  publicacoes.forEach(pub => {
    if (pub.topic === topico) {
      freq[pub.year] = (freq[pub.year] || 0) + 1;
    }
  });
  const anos = Object.keys(pubsPorAno());
  return anos.map(a => freq[a] || 0);
}

/* =====================
   Funções de consulta
===================== */
function topTopicos(anos, top = 15) {
  const anoAtual = new Date().getFullYear();
  const inicio = anoAtual - anos;
  const contagem = {};

  publicacoes.forEach(pub => {
    if (pub.year >= inicio && pub.topic) {
      contagem[pub.topic] = (contagem[pub.topic] || 0) + 1;
    }
  });

  // Ordena e retorna apenas os 'top' resultados
  return ordenarObj(contagem).slice(0, top);
}

function palavrasMaisFrequentes(top = 20) {
  const freq = {};
  publicacoes.forEach(pub => {
    const texto = (pub.title + " " + pub.abstract).toLowerCase();
    const palavras = texto.match(/\b[a-zà-ú0-9]+\b/gi) || [];
    palavras.forEach(p => { if (p.length > 3) freq[p] = (freq[p] || 0) + 1 });
  });
  return ordenarObj(freq).slice(0, top);
}

function artigosMaisCitados(top = 10) {
  return [...publicacoes].sort((a, b) => b.citation_ids.length - a.citation_ids.length).slice(0, top);
}

function autoresMaisPublicacoes(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => pub.authors.forEach(a => freq[a] = (freq[a] || 0) + 1));
  return ordenarObj(freq).slice(0, top);
}

function autoresPorTopico(topico, top = 10) {
  const freq = {};
  publicacoes.forEach(pub => { if (pub.topic === topico) pub.authors.forEach(a => freq[a] = (freq[a] || 0) + 1) });
  return ordenarObj(freq).slice(0, top);
}

function autoresMaisCitados(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => { const n = pub.citation_ids.length; pub.authors.forEach(a => freq[a] = (freq[a] || 0) + n) });
  return ordenarObj(freq).slice(0, top);
}


// TODO: As instituicoes estão em um formato esquisito
function instituicoesMaisPublicacoes(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => {
    if (pub.affiliations) Object.values(pub.affiliations).flat().forEach(inst => freq[inst] = (freq[inst] || 0) + 1);
  });
  return ordenarObj(freq).slice(0, top);
}

function instituicoesMaisCitacoes(top = 10) {
  const freq = {};
  publicacoes.forEach(pub => {
    const n = pub.citation_ids.length;
    if (pub.affiliations) Object.values(pub.affiliations).flat().forEach(inst => freq[inst] = (freq[inst] || 0) + n);
  });
  return ordenarObj(freq).slice(0, top);
}

/* =====================
   Função utilitária
===================== */
function ordenarObj(obj) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]);
}

document.addEventListener('DOMContentLoaded', function () {
  carregarJSON()
});
