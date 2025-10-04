// data-loader.js - loads dataset.json and exposes a simplified article list
export async function loadDataset(url, options = {}){
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Failed to load dataset');
  const data = await resp.json();
  const limit = Number.isFinite(options.limit) ? options.limit : Infinity;
  const items = [];
  console.log('[data-loader] dataset length:', Array.isArray(data)? data.length : 'not-array');
  for(const entry of data){
    if(!entry) continue;
    // try common fields; fallbacks
    const title = entry.title || entry.journal_title || entry.meta?.title || (entry.fields && entry.fields.title) || (entry.header && entry.header.title) || 'Untitled';
    const abstract = (entry.abstract && (typeof entry.abstract === 'string' ? entry.abstract : (entry.abstract.value || (Array.isArray(entry.abstract) && entry.abstract[0]) || ''))) || entry.summary || entry.description || '';
    // aggregate terms for similarity + display
    const descriptorList = collectDescriptors(entry, abstract);
    const displayTerms = descriptorList.slice(0,3).map(d=>d.original);
    const tokens = descriptorList.slice(0,12).map(d=>d.normalized);
    const fallbackTerms = displayTerms.length ? displayTerms : extractTopTerms(abstract,3);

  const authors = extractAuthors(entry);
  const topic = extractPrimaryTopic(entry);
  const topics = collectTopics(entry, topic);
  const year = extractYear(entry);
  const affiliations = extractAffiliations(entry);
  const link = extractPrimaryLink(entry);
  const pdf = extractPdfLink(entry);

    items.push({
      id: entry.id || entry.uid || entry.doi || title,
      title,
      abstract,
      terms: fallbackTerms,
      tokens,
      authors,
      topic,
      topics,
      year,
      journal: entry.journal || entry.source || entry.container_title || entry.meta?.journal,
      affiliations,
      link,
      pdf,
      doi: entry.doi || entry.meta?.doi
    });
    if(items.length >= limit) break;
  }
  console.log('[data-loader] extracted items:', items.length);
  return items;
}

function extractAuthors(entry){
  const out = [];
  const push = value => {
    if(!value) return;
    const name = typeof value === 'string' ? value : (value.name || value.full_name || value.author);
    if(!name) return;
    const clean = String(name).trim();
    if(!clean) return;
    if(out.includes(clean)) return;
    out.push(clean);
  };
  if(Array.isArray(entry.authors)) entry.authors.forEach(push);
  if(Array.isArray(entry.creators)) entry.creators.forEach(push);
  if(Array.isArray(entry.contributors)) entry.contributors.forEach(push);
  if(typeof entry.author === 'string') push(entry.author);
  return out;
}

function extractPrimaryTopic(entry){
  if(entry.topic) return String(entry.topic).trim();
  if(entry.category) return String(entry.category).trim();
  if(Array.isArray(entry.subjects) && entry.subjects.length) return String(entry.subjects[0]).trim();
  return '';
}

function collectTopics(entry, primary){
  const topics = new Set();
  if(primary) topics.add(primary);
  const push = value => {
    if(!value) return;
    const clean = String(value).trim();
    if(clean) topics.add(clean);
  };
  if(Array.isArray(entry.subjects)) entry.subjects.forEach(push);
  if(Array.isArray(entry.topics)) entry.topics.forEach(push);
  if(Array.isArray(entry.terms)) entry.terms.forEach(push);
  if(entry.topic && entry.topic !== primary) push(entry.topic);
  return Array.from(topics);
}

function extractYear(entry){
  const candidates = [
    entry.year,
    entry.publication_year,
    entry.publicationYear,
    entry.meta?.year,
    entry.meta?.publication_year,
    entry.provenance?.year
  ];
  for(const candidate of candidates){
    const num = Number.parseInt(candidate, 10);
    if(num && num > 0) return num;
  }
  const dateFields = [entry.date, entry.published, entry.publication_date, entry.issued, entry.meta?.date];
  for(const value of dateFields){
    if(!value) continue;
    const yearMatch = String(value).match(/(19|20)\d{2}/);
    if(yearMatch){
      const num = Number.parseInt(yearMatch[0],10);
      if(num && num > 0) return num;
    }
  }
  return undefined;
}

function extractAffiliations(entry){
  const results = [];
  const seen = new Set();
  const pushAff = value => {
    if(!value) return;
    const clean = normalizeAffiliation(value);
    if(!clean) return;
    if(seen.has(clean)) return;
    seen.add(clean);
    results.push(clean);
  };

  const source = entry.affiliations;
  if(source && typeof source === 'object'){
    if(Array.isArray(source)){
      source.forEach(pushAff);
    }else{
      Object.values(source).forEach(val => {
        if(Array.isArray(val)) val.forEach(pushAff);
        else pushAff(val);
      });
    }
  }
  return results;
}

function extractPrimaryLink(entry){
  const raw = entry.url || entry.link || entry.landing_url || entry.webpage || entry.source_url;
  const provenanceLink = entry.provenance?.source_url || entry.provenance?.url;
  const doi = entry.doi || entry.meta?.doi;
  const doiLink = doi ? (doi.startsWith('http') ? doi : `https://doi.org/${doi}`) : undefined;
  return firstTruthy(raw, provenanceLink, doiLink);
}

function extractPdfLink(entry){
  const raw = entry.pdf || entry.pdf_url || entry.fulltext_pdf || entry.pdfLink;
  const provenancePdf = entry.provenance?.pdf_url || entry.links?.pdf;
  return firstTruthy(raw, provenancePdf);
}

function firstTruthy(...values){
  for(const value of values){
    if(typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeAffiliation(value){
  let text = String(value).replace(/\r?\n+/g,' ').replace(/\s+/g,' ').trim();
  if(!text) return '';
  text = text.replace(/^\d+\s*/, '').replace(/^\D?\d+\s*/, '');
  return text;
}

function collectDescriptors(entry, abstract){
  const raw = [];
  const pushList = list => { if(Array.isArray(list)) raw.push(...list); };
  pushList(entry.top_terms);
  pushList(entry.keywords);
  if(entry.topic) raw.push(entry.topic);
  if(entry.terms) pushList(entry.terms);
  if(entry.subjects) pushList(entry.subjects);

  if(raw.length < 5){
    // augment with title/abstract keywords if metadata sparse
    if(entry.title) raw.push(...String(entry.title).split(/[,;/]|\band\b|\bwith\b/gi));
    raw.push(...extractTopTerms(abstract,6));
  }

  const descriptors = [];
  const seen = new Set();
  for(const candidate of raw){
    if(!candidate) continue;
    const original = String(candidate).trim();
    if(!original) continue;
    const normalized = normalizeDescriptor(original);
    if(!normalized) continue;
    if(seen.has(normalized)) continue;
    seen.add(normalized);
    descriptors.push({original, normalized});
  }
  return descriptors;
}

function normalizeDescriptor(value){
  const clean = value.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean).join(' ');
  return clean;
}

// Very small heuristic extractor for top terms
function extractTopTerms(text, n=3){
  if(!text) return [];
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  const stop = new Set(['the','and','of','in','to','a','is','for','with','on','that','as','are','we','this','was','by','an','be']);
  const freq = Object.create(null);
  for(const w of words){ if(w.length < 4) continue; if(stop.has(w)) continue; freq[w] = (freq[w]||0)+1; }
  const sorted = Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);
  return sorted.slice(0,n);
}
