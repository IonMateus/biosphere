// data-loader.js - loads dataset.json and exposes a simplified article list
export async function loadDataset(url, options = {}){
  const resp = await fetch(url);
  if(!resp.ok) throw new Error('Failed to load dataset');
  const data = await resp.json();
  const limit = options.limit || 300; // render cap for performance
  const items = [];
  console.log('[data-loader] dataset length:', Array.isArray(data)? data.length : 'not-array');
  for(const entry of data){
    if(!entry) continue;
    // try common fields; fallbacks
    const title = entry.title || entry.journal_title || entry.meta?.title || (entry.fields && entry.fields.title) || (entry.header && entry.header.title) || 'Untitled';
    const abstract = (entry.abstract && (typeof entry.abstract === 'string' ? entry.abstract : (entry.abstract.value || (Array.isArray(entry.abstract) && entry.abstract[0]) || ''))) || entry.summary || entry.description || '';
    // top terms: try entry.top_terms, keywords, or compute from abstract
    let terms = [];
    if(entry.top_terms && Array.isArray(entry.top_terms)) terms = entry.top_terms.slice(0,3).map(t=>String(t));
    else if(entry.keywords && Array.isArray(entry.keywords)) terms = entry.keywords.slice(0,3).map(k=>String(k));
    else terms = extractTopTerms(abstract,3);

    items.push({title, abstract, terms});
    if(items.length >= limit) break;
  }
  console.log('[data-loader] extracted items:', items.length);
  return items;
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
