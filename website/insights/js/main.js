const DATA_PATH = '../data/dataset.json';
let pubs = [];
let chartPubsByYear = null;
let chartTopicByYear = null;

async function loadData(){
  try{
    const res = await fetch(DATA_PATH);
    pubs = await res.json();
    console.log('dataset loaded', pubs.length);
    initDashboard();
  }catch(e){
    console.error('failed to load dataset', e);
  }
}

function initDashboard(){
  fillOverviewCards();
  renderPubsByYear();
  renderTopTopics();
  renderAuthorsRank();
  renderAffiliationsRank();
  setupSearch();
  // coauthor network removed per request
  // render initial trending and wire change
  renderTrending();
  const trendYears = document.getElementById('trendYears');
  if(trendYears) trendYears.addEventListener('change', ()=>renderTrending());
  // try to auto-select 'bone' if available (search input default set in HTML)
  setTimeout(()=>{
    const q = 'bone';
    const allTopics = Array.from(new Set(pubs.flatMap(p=> (p.top_terms||[]).map(t=>String(t).trim()) ))).sort();
    const match = allTopics.find(t=>t.toLowerCase().startsWith(q));
    if(match){
      const input = document.getElementById('topicSearch');
      if(input) input.value = match;
      selectTopic(match);
    }
  }, 300);
}

function fillOverviewCards(){
  document.getElementById('totalPubs').textContent = pubs.length;
  const authors = new Set();
  const topics = new Set();
  pubs.forEach(p=>{ (p.authors||[]).forEach(a=>authors.add(a)); if(p.topic) topics.add(p.topic); });
  document.getElementById('totalAuthors').textContent = authors.size;
  document.getElementById('totalTopics').textContent = topics.size;
}

function pubsPerYear(){
  const m = {};
  pubs.forEach(p=>{ if(p.year){ m[p.year]= (m[p.year]||0)+1 } });
  return Object.keys(m).sort().map(y=>({year:y, count:m[y]}));
}

function renderPubsByYear(){
  const ctx = document.getElementById('pubsByYear').getContext('2d');
  const data = pubsPerYear();
  const labels = data.map(d=>d.year);
  const values = data.map(d=>d.count);
  if (chartPubsByYear) chartPubsByYear.destroy();
  chartPubsByYear = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
        label: 'Publications',
          data: values,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.06)',
          tension: 0.25
        }
      ]
    },
    options: {
      scales: {
        x: { ticks: { color: '#cbd5e1' } },
        y: { ticks: { color: '#cbd5e1' } }
      },
      plugins: { legend: { labels: { color: '#fff' } } }
    }
  });
}

  // Count terms from `top_terms` field in the dataset for a given period
function topTopics(lastYears=5, topN=15){
  const current = new Date().getFullYear();
  const start = current - lastYears + 1; // include current-year - (lastYears-1)
  const freq = {};
  pubs.forEach(p=>{
    if(!p.top_terms || !p.year) return;
    if(p.year >= start){
      p.top_terms.forEach(t=>{ const term = String(t).trim(); if(term) freq[term] = (freq[term]||0)+1 });
    }
  });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,topN);
}

function renderTopTopics(){
  const yearsInput = document.getElementById('yearsInput');
  const render = ()=>{
    const years = Number(yearsInput.value)||5;
    const list = topTopics(years,20);
    const ul = document.getElementById('topTopicsList'); ul.innerHTML='';
    list.forEach(([t,n])=>{
      const li = document.createElement('li'); li.innerHTML = `<span class="t">${t}</span><strong>${n}</strong>`;
      ul.appendChild(li);
    });
  };
  document.getElementById('refreshTopics').addEventListener('click', render);
  render();
}

  // Compute trend delta for terms: delta = total_now - total_up_to_cutoff
function trendTopics(yearsBack=3){
  const current = new Date().getFullYear();
  const cutoff = current - yearsBack; // count before or equal to cutoff
  const termTotals = {}; // total now
  const termBefore = {}; // total up to cutoff (<= cutoff)

  pubs.forEach(p=>{
    if(!p.top_terms) return;
    p.top_terms.forEach(t=>{
      const term = String(t).trim();
      if(!term) return;
      termTotals[term] = (termTotals[term]||0) + 1;
      if(p.year && p.year <= cutoff){ termBefore[term] = (termBefore[term]||0) + 1 }
    });
  });

  const entries = Object.keys(termTotals).map(term => {
    const total = termTotals[term]||0;
    const before = termBefore[term]||0;
    const delta = total - before; // positive => increasing
    return {term, total, before, delta};
  });
  entries.sort((a,b)=>b.delta - a.delta);
  return entries;
}

function renderTrending(){
  const yearsInput = document.getElementById('trendYears');
  const years = Number(yearsInput.value)||3;
  const trends = trendTopics(years);
  // positives on the top row (largest positive delta), negatives on the bottom row (most negative first)
  const up = trends.filter(t=>t.delta>0).slice(0,8);
  const down = trends.filter(t=>t.delta<0).slice(0,8);
  const upCont = document.getElementById('trendingUp'); upCont.innerHTML='';
  const downCont = document.getElementById('trendingDown'); downCont.innerHTML='';

  // render top positives left-to-right
  up.forEach(t=>{
    const card = document.createElement('div');
    card.className='card';
    card.setAttribute('data-term', t.term);
    card.innerHTML = `<div>${t.term}</div><div style="color:var(--accent)">▲ ${t.delta}</div>`;
    upCont.appendChild(card);
  });

  // render negatives left-to-right, but display delta as absolute decline
  down.forEach(t=>{
    const card = document.createElement('div');
    card.className='card';
    card.setAttribute('data-term', t.term);
    const absDelta = Math.abs(t.delta);
    card.innerHTML = `<div>${t.term}</div><div style="color:#ff6b6b">▼ ${absDelta}</div>`;
    downCont.appendChild(card);
  });
}

function selectTopic(topic){
  document.getElementById('topicName').textContent = topic;
  // publications by year for topic
  // use top_terms counting: a publication contains the term if its top_terms includes it
  const byYear = {};
  pubs.forEach(p=>{ if(p.top_terms && p.top_terms.includes(topic)){ byYear[p.year]=(byYear[p.year]||0)+1 }});
  const years = Object.keys(byYear).sort();
  const values = years.map(y=>byYear[y]);
  const ctx = document.getElementById('topicPubsByYear').getContext('2d');
  if (chartTopicByYear) chartTopicByYear.destroy();
  chartTopicByYear = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          label: topic,
          data: values,
          backgroundColor: '#22c55e'
        }
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#fff' } } },
      scales: { x: { ticks: { color: '#cbd5e1' } }, y: { ticks: { color: '#cbd5e1' } } }
    }
  });

  // authors ranking for topic
  const authFreq = {};
  const affFreq = {};
  pubs.forEach(p=>{ if(p.top_terms && p.top_terms.includes(topic)){ (p.authors||[]).forEach(a=>authFreq[a]=(authFreq[a]||0)+1); if(p.affiliations) Object.values(p.affiliations).flat().forEach(a=>affFreq[cleanAff(a)]=(affFreq[cleanAff(a)]||0)+1) }});
  fillListFromObj('topicAuthors', authFreq, 10);
  fillListFromObj('topicAffiliations', affFreq, 10);
}

function cleanAff(s){ if(!s) return ''; return s.replace(/^\d+\s*/,'').split(',')[0].trim(); }

function fillListFromObj(elId, obj, top=10){
  const items = Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,top);
  const ul = document.getElementById(elId); ul.innerHTML='';
  const max = items.length ? items[0][1] : 1;
  items.forEach(([k,v])=>{
    const li = document.createElement('li');
    li.innerHTML = `<div style="width:100%;display:flex;flex-direction:column"><div style=\"display:flex;justify-content:space-between;align-items:center\"><span>${k}</span><strong>${v}</strong></div><div class=\"bar\"><i style=\"width:${Math.round((v/max)*100)}%\"></i></div></div>`;
    ul.appendChild(li);
  });
}

function authorsMost(){
  const freq = {};
  pubs.forEach(p=> (p.authors||[]).forEach(a=> freq[a]=(freq[a]||0)+1));
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]);
}

function renderAuthorsRank(){
  const arr = authorsMost().slice(0,20);
  const obj = Object.fromEntries(arr);
  fillListFromObj('authorsRank', obj, 20);
}

function affiliationsMost(){
  const freq = {};
  pubs.forEach(p=>{ if(p.affiliations) Object.values(p.affiliations).flat().forEach(a=>{ const c = cleanAff(a); freq[c]=(freq[c]||0)+1 }) });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]);
}

function renderAffiliationsRank(){ fillListFromObj('affiliationsRank', Object.fromEntries(affiliationsMost().slice(0,50)), 50); }

function setupSearch(){
  const input = document.getElementById('topicSearch');
  const sugg = document.getElementById('suggestions');
  // build terms list from top_terms across the dataset
  const allTerms = new Set();
  pubs.forEach(p=>{ if(p.top_terms) p.top_terms.forEach(t=>{ if(t) allTerms.add(String(t).trim()); }) });
  const allTopics = Array.from(allTerms).sort();
  input.addEventListener('input', ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ sugg.hidden=true; return; }
    const matches = allTopics.filter(t=>t.toLowerCase().startsWith(q)).slice(0,12);
    sugg.innerHTML='';
    matches.forEach(m=>{ const li=document.createElement('li'); li.textContent=m; li.onclick=()=>{ input.value=m; sugg.hidden=true; selectTopic(m); }; sugg.appendChild(li); });
    sugg.hidden = matches.length===0;
  });
  document.addEventListener('click', e=>{ if(!e.target.closest('.search')) sugg.hidden=true; });
}

function renderCoauthorNetwork(){
  // coauthor graph removed per request
}

// initial render of trending after dataset loaded
document.addEventListener('DOMContentLoaded', ()=>{ loadData().then(()=>{ renderTrending(); }); });
