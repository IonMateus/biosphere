// cards.js - create card elements and scatter them on the stage
export function createCard(article){
  const el = document.createElement('article'); el.className = 'card';
  const h = document.createElement('h3'); h.textContent = article.title || 'Untitled'; el.appendChild(h);
  const metaPieces = [];
  if(typeof article.year === 'number') metaPieces.push(String(article.year));
  if(Array.isArray(article.authors) && article.authors.length){
    const primaryAuthors = article.authors.slice(0,2).join(', ');
    const remaining = article.authors.length - 2;
    metaPieces.push(remaining > 0 ? `${primaryAuthors} +${remaining}` : primaryAuthors);
  }
  if(article.journal) metaPieces.push(article.journal);
  if(metaPieces.length){
    const meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.textContent = metaPieces.join(' • ');
    el.appendChild(meta);
  }
  const p = document.createElement('p'); p.textContent = (article.abstract || '').slice(0,100) + (article.abstract && article.abstract.length>100 ? '…' : ''); el.appendChild(p);
  const labels = document.createElement('div'); labels.className = 'labels';
  (article.terms || []).slice(0,3).forEach((t,i)=>{
    const l = document.createElement('span'); l.className = 'label' + (i===0? ' label--accent':''); l.textContent = t; labels.appendChild(l);
  });
  el.appendChild(labels);
  // small log for debugging
  // console.log('[cards] created card', {title: article.title, terms: article.terms});
  return el;
}

export function scatterCards(stage, articles, opts = {}){
  const total = Array.isArray(articles) ? articles.length : 0;
  const baseline = Math.max(15000, Math.sqrt(Math.max(1, total)) * 780 + 5800);
  const width = opts.width || baseline * 1.4;
  const height = opts.height || baseline * 1.08;
  const margin = opts.margin || Math.max(700, Math.round(Math.min(width, height) * 0.08));
  const neighborCount = opts.neighborCount || 3;
  const minSimilarity = opts.minSimilarity || 0.2;

  stage.innerHTML = '';
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  const tokenSets = articles.map(article => prepTokens(article));
  const graph = buildSimilarityGraph(articles, tokenSets, {neighborCount, minSimilarity});
  const layoutMetrics = {
    width,
    height,
    margin,
    nodeRadius: opts.nodeRadius || 250
  };
  const nodePositions = runForceLayout(articles.length, graph.edges, layoutMetrics);

  const linkLayer = createLinkLayer(stage, width, height);
  stage.appendChild(linkLayer);

  const frag = document.createDocumentFragment();
  const nodeRefs = [];
  for(let i = 0; i < articles.length; i++){
    const article = articles[i];
    const card = createCard(article);
    const pos = nodePositions[i];
  card.style.left = `${pos.x}px`;
  card.style.top = `${pos.y}px`;
    const articleId = article?.id || article?.uid || article?.doi || `article-${i}`;
    card.dataset.articleId = String(articleId);
    card.dataset.x = pos.x;
    card.dataset.y = pos.y;
    card.dataset.nodeIndex = i;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
  card.setAttribute('data-panzoom-ignore', 'true');
    const ariaLabelParts = [];
    if(article?.title) ariaLabelParts.push(article.title);
    if(article?.journal) ariaLabelParts.push(article.journal);
    if(article?.year) ariaLabelParts.push(String(article.year));
    if(ariaLabelParts.length){
      card.setAttribute('aria-label', ariaLabelParts.join(' — '));
    }
    frag.appendChild(card);
    nodeRefs.push({el: card, pos});
  }
  stage.appendChild(frag);

  let sumWidth = 0;
  let sumHeight = 0;
  for(const node of nodeRefs){
    const w = node.el.offsetWidth || 260;
    const h = node.el.offsetHeight || 150;
    node.width = w; node.height = h;
    sumWidth += w;
    sumHeight += h;
    node.centerX = node.pos.x + w/2;
    node.centerY = node.pos.y + h/2;
    node.el.dataset.w = w;
    node.el.dataset.h = h;
  }

  const avgWidth = sumWidth / Math.max(1, nodeRefs.length);
  const minGap = Math.max(600, Math.min(layoutMetrics.nodeRadius * 1.95, avgWidth * 1.45));
  const buffer = Math.max(220, avgWidth * 0.52);
  resolveCollisions(nodeRefs, {minGap, buffer, width, height, margin, iterations: 26});

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for(const node of nodeRefs){
    node.centerX = node.pos.x + node.width/2;
    node.centerY = node.pos.y + node.height/2;
    node.el.style.left = `${node.pos.x}px`;
    node.el.style.top = `${node.pos.y}px`;
    const left = node.pos.x;
    const top = node.pos.y;
    const right = left + node.width;
    const bottom = top + node.height;
    if(left < minX) minX = left;
    if(top < minY) minY = top;
    if(right > maxX) maxX = right;
    if(bottom > maxY) maxY = bottom;
  }
  let boundsWidth = Math.max(0, maxX - minX);
  let boundsHeight = Math.max(0, maxY - minY);
  let centerX = minX + boundsWidth / 2;
  let centerY = minY + boundsHeight / 2;

  if(!nodeRefs.length){
    boundsWidth = 0;
    boundsHeight = 0;
    centerX = width / 2;
    centerY = height / 2;
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  if(Number.isFinite(centerX) && Number.isFinite(centerY)){
    stage.dataset.centerX = centerX.toFixed(2);
    stage.dataset.centerY = centerY.toFixed(2);
    stage.dataset.boundsWidth = boundsWidth.toFixed(2);
    stage.dataset.boundsHeight = boundsHeight.toFixed(2);
  }

  drawConnections(linkLayer, graph.edges, nodeRefs);
  setupHoverHighlights(nodeRefs, linkLayer);
  console.log('[cards] layout complete', {nodes: nodeRefs.length, links: graph.edges.length});
  return {
    center: {x: centerX, y: centerY},
    bounds: {minX, minY, maxX, maxY, width: boundsWidth, height: boundsHeight},
    stage: {width, height},
    counts: {nodes: nodeRefs.length, links: graph.edges.length}
  };
}

function prepTokens(article){
  const set = new Set();
  const add = value => {
    if(!value) return;
    const clean = String(value).toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim();
    if(!clean) return;
    clean.split(/\s+/).forEach(token => {
      if(token.length < 3) return;
      set.add(token);
    });
  };
  if(Array.isArray(article.tokens)){ article.tokens.forEach(add); }
  if(Array.isArray(article.terms)){ article.terms.forEach(add); }
  if(!set.size && article.abstract){
    article.abstract.slice(0,280).split(/[^a-z0-9]+/i).forEach(add);
  }
  return Array.from(set);
}

function buildSimilarityGraph(articles, tokenSets, options){
  const baseMinSim = options.minSimilarity ?? 0.18;
  const maxLinks = options.neighborCount ?? 4;
  const count = tokenSets.length;
  const sims = Array.from({length: count}, () => []);
  const allSims = [];
  for(let i = 0; i < count; i++){
    const setA = new Set(tokenSets[i]);
    const articleA = articles[i] || {};
    for(let j = i + 1; j < count; j++){
      const articleB = articles[j] || {};
      const base = jaccard(setA, tokenSets[j]);
      const termAffinity = computeTermAffinity(articleA, articleB);
      const authorAffinity = computeAuthorOverlap(articleA.authors, articleB.authors);
      const journalBonus = computeJournalBonus(articleA.journal, articleB.journal);
      const yearAffinity = computeYearAffinity(articleA.year, articleB.year);
      let similarity = 0;
      similarity += base * 0.65;
      similarity += termAffinity * 0.35;
      similarity += authorAffinity * 0.25;
      similarity += journalBonus;
      similarity += yearAffinity * 0.12;
      if(similarity <= 0.01) continue;
      const combined = Math.min(1, similarity);
      allSims.push(combined);
      sims[i].push({index: j, sim: combined});
      sims[j].push({index: i, sim: combined});
    }
  }

  let threshold = baseMinSim;
  if(allSims.length > 12){
    const sortedGlobal = allSims.slice().sort((a, b) => a - b);
    const qIndex = Math.floor(sortedGlobal.length * 0.45);
    const qValue = sortedGlobal[qIndex];
    if(qValue && qValue > threshold){
      threshold = Math.min(0.72, qValue * 0.95);
    }
  }
  threshold = Math.max(baseMinSim * 0.8, threshold);

  const edges = [];
  const edgeKey = new Set();
  for(let i = 0; i < count; i++){
    const sorted = sims[i].sort((a, b) => b.sim - a.sim);
    const selected = [];
    for(const entry of sorted){
      if(selected.length >= maxLinks) break;
      if(entry.sim < threshold) continue;
      selected.push(entry);
    }
    if(selected.length < Math.min(2, sorted.length)){
      for(const entry of sorted){
        if(selected.includes(entry)) continue;
        selected.push(entry);
        if(selected.length >= Math.min(2, sorted.length)) break;
      }
    }
    if(!selected.length && sorted.length){
      selected.push(sorted[0]);
    }
    for(const entry of selected){
      const key = i < entry.index ? `${i}-${entry.index}` : `${entry.index}-${i}`;
      if(edgeKey.has(key)) continue;
      edgeKey.add(key);
      edges.push({a: i, b: entry.index, sim: entry.sim});
    }
  }
  return {edges};
}

function computeTermAffinity(articleA, articleB){
  const termsA = normalizeTermList(articleA);
  const termsB = normalizeTermList(articleB);
  if(!termsA.length || !termsB.length) return 0;
  const setA = new Set(termsA);
  const setB = new Set(termsB);
  let overlap = 0;
  for(const term of setB){
    if(setA.has(term)) overlap++;
  }
  const denom = Math.max(1, Math.min(setA.size, setB.size, 6));
  let affinity = Math.min(1, overlap / denom);
  const primaryA = termsA[0];
  const primaryB = termsB[0];
  if(primaryA && primaryB && primaryA === primaryB){
    affinity = Math.min(1, affinity + 0.3);
  }
  return affinity;
}

function computeAuthorOverlap(authorsA, authorsB){
  if(!Array.isArray(authorsA) || !Array.isArray(authorsB) || !authorsA.length || !authorsB.length) return 0;
  const normA = authorsA.map(normalizeAuthorToken).filter(Boolean);
  const normB = authorsB.map(normalizeAuthorToken).filter(Boolean);
  if(!normA.length || !normB.length) return 0;
  const setA = new Set(normA);
  const used = new Set();
  let matches = 0;
  for(const token of normB){
    if(setA.has(token) && !used.has(token)){
      matches++;
      used.add(token);
    }
  }
  const denom = Math.max(1, Math.max(setA.size, normB.length));
  return matches / denom;
}

function computeJournalBonus(journalA, journalB){
  const normA = normalizeJournal(journalA);
  const normB = normalizeJournal(journalB);
  if(!normA || !normB) return 0;
  return normA === normB ? 0.12 : 0;
}

function computeYearAffinity(yearA, yearB){
  if(!Number.isFinite(yearA) || !Number.isFinite(yearB)) return 0;
  const diff = Math.abs(yearA - yearB);
  if(diff === 0) return 1;
  if(diff === 1) return 0.7;
  if(diff === 2) return 0.4;
  if(diff <= 4) return 0.2;
  return 0;
}

function normalizeTermList(article){
  const values = Array.isArray(article?.terms)
    ? article.terms
    : Array.isArray(article?.topics)
      ? article.topics
      : [];
  return values
    .map(term => String(term).toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function normalizeAuthorToken(name){
  if(!name) return '';
  const clean = String(name).toLowerCase().trim();
  if(!clean) return '';
  const parts = clean.split(/[^a-z0-9]+/).filter(Boolean);
  if(!parts.length) return clean;
  return parts[parts.length - 1];
}

function normalizeJournal(value){
  if(!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function jaccard(setA, tokensB){
  if(!tokensB || !tokensB.length || !setA.size) return 0;
  let intersection = 0;
  const seen = new Set();
  for(const tok of tokensB){
    if(seen.has(tok)) continue;
    seen.add(tok);
    if(setA.has(tok)) intersection++;
  }
  const union = setA.size + seen.size - intersection;
  if(union === 0) return 0;
  return intersection / union;
}

function runForceLayout(count, edges, opts){
  if(count === 0) return [];
  const width = opts.width;
  const height = opts.height;
  const margin = opts.margin || 260;
  const radius = opts.nodeRadius || 160;
  const centerX = width / 2;
  const centerY = height / 2;
  const radialScale = Math.min(width, height) * 0.34;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const nodes = Array.from({length: count}, (_, index) => {
    const angle = index * goldenAngle;
    const r = radialScale * Math.sqrt((index + 0.5) / count);
    return {
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r,
      vx: 0,
      vy: 0
    };
  });
  const iterations = Math.min(620, 240 + count * 2.8);
  const repulsionStrength = 27000 * Math.sqrt(count);
  const springK = 0.064;
  const damping = 0.82;
  const minLen = radius * 1.18;
  const maxLen = radius * 3.05;

  for(let iter=0; iter<iterations; iter++){
    for(const node of nodes){
      node.vx *= damping;
      node.vy *= damping;
    }

    for(let i=0;i<count;i++){
      for(let j=i+1;j<count;j++){
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
    let distSq = dx*dx + dy*dy + 0.01;
    const dist = Math.sqrt(distSq);
    const target = radius * 1.15;
    const force = repulsionStrength / (distSq + target * target);
        const fx = force * dx / dist;
        const fy = force * dy / dist;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    for(const edge of edges){
      const source = nodes[edge.a];
      const target = nodes[edge.b];
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
  const similarity = Math.min(1, edge.sim || 0);
  const closeness = 0.68 - similarity * 0.28;
  const spread = 0.42 + (1 - similarity) * 0.45;
  const desiredRaw = minLen * closeness + (maxLen - minLen) * spread;
  const minDesired = minLen * 0.85;
  const maxDesired = maxLen * 1.05;
  const desired = Math.min(maxDesired, Math.max(minDesired, desiredRaw));
    const force = springK * (dist - desired);
      const fx = force * dx / dist;
      const fy = force * dy / dist;
      source.vx += fx;
      source.vy += fy;
      target.vx -= fx;
      target.vy -= fy;
    }

    for(const node of nodes){
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for(const node of nodes){
    if(node.x < minX) minX = node.x;
    if(node.x > maxX) maxX = node.x;
    if(node.y < minY) minY = node.y;
    if(node.y > maxY) maxY = node.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - margin*2) / spanX, (height - margin*2) / spanY, 1.15);

  return nodes.map(node => ({
    x: margin + (node.x - minX) * scale,
    y: margin + (node.y - minY) * scale
  }));
}

function resolveCollisions(nodes, opts){
  const minGap = opts.minGap || 560;
  const buffer = opts.buffer || 220;
  const maxWidth = opts.width;
  const maxHeight = opts.height;
  const margin = opts.margin || 340;
  const iterations = opts.iterations || 18;

  const radiusCache = new WeakMap();
  const getRadius = node => {
    if(radiusCache.has(node)) return radiusCache.get(node);
    const w = node.width || node.el?.offsetWidth || 260;
    const h = node.height || node.el?.offsetHeight || 160;
    const r = Math.sqrt((w * w + h * h)) / 2;
    radiusCache.set(node, r);
    return r;
  };

  for(let pass = 0; pass < iterations; pass++){
    let moved = false;
    for(let i=0; i<nodes.length; i++){
      for(let j=i+1; j<nodes.length; j++){
        const a = nodes[i];
        const b = nodes[j];
        const ax = a.pos.x + a.width / 2;
        const ay = a.pos.y + a.height / 2;
        const bx = b.pos.x + b.width / 2;
        const by = b.pos.y + b.height / 2;
        let dx = bx - ax;
        let dy = by - ay;
        let distSq = dx * dx + dy * dy;

  const radiusA = getRadius(a);
  const radiusB = getRadius(b);
  const required = Math.max(minGap, radiusA + radiusB + buffer);
        const requiredSq = required * required;

        if(distSq >= requiredSq) continue;

        let dist = Math.sqrt(distSq);
        if(dist < 0.001){
          dist = 0.001;
          const angle = deterministicNoise(i, j, pass, 0) * Math.PI * 2;
          dx = Math.cos(angle) * dist;
          dy = Math.sin(angle) * dist;
        }

        const overlap = (required - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.pos.x -= nx * overlap;
        a.pos.y -= ny * overlap;
        b.pos.x += nx * overlap;
        b.pos.y += ny * overlap;
        const jitterAx = (deterministicNoise(i, j, pass, 1) - 0.5) * 3.2;
        const jitterAy = (deterministicNoise(i, j, pass, 2) - 0.5) * 3.2;
        const jitterBx = (deterministicNoise(j, i, pass, 3) - 0.5) * 3.2;
        const jitterBy = (deterministicNoise(j, i, pass, 4) - 0.5) * 3.2;
        a.pos.x += jitterAx;
        a.pos.y += jitterAy;
        b.pos.x += jitterBx;
        b.pos.y += jitterBy;
        moved = true;
      }
    }
    if(!moved) break;
  }

  for(const node of nodes){
    node.pos.x = clamp(node.pos.x, margin * 0.8, maxWidth - margin * 0.8 - node.width);
    node.pos.y = clamp(node.pos.y, margin * 0.8, maxHeight - margin * 0.8 - node.height);
  }
}

function clamp(value, min, max){
  if(value < min) return min;
  if(value > max) return max;
  return value;
}

function deterministicNoise(a, b, c = 0, d = 0){
  let hash = 2166136261;
  const inputs = [a, b, c, d];
  for(const input of inputs){
    const value = Number.isFinite(input) ? Math.floor(input) : 0;
    hash ^= value + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function createLinkLayer(stage, width, height){
  let svg = stage.querySelector('svg.link-layer');
  if(!svg){
    svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('link-layer');
  }
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
  svg.style.left = '0';
  svg.style.top = '0';
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.innerHTML = '';
  return svg;
}

function drawConnections(svg, edges, nodes){
  if(!svg) return;
  const frag = document.createDocumentFragment();
  for(const edge of edges){
    const src = nodes[edge.a];
    const dst = nodes[edge.b];
    if(!src || !dst) continue;
  const dx = dst.centerX - src.centerX;
  const dy = dst.centerY - src.centerY;
  const distance = Math.sqrt(dx*dx + dy*dy);
  const similarity = Math.min(1, edge.sim || 0);
  const maxDistance = 520 + (1 - similarity) * 1800;
  if(distance > maxDistance) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    const srcAnchor = computeAnchorPoint(src, dst);
    const dstAnchor = computeAnchorPoint(dst, src);
    line.setAttribute('x1', srcAnchor.x.toFixed(2));
    line.setAttribute('y1', srcAnchor.y.toFixed(2));
    line.setAttribute('x2', dstAnchor.x.toFixed(2));
    line.setAttribute('y2', dstAnchor.y.toFixed(2));
    const opacity = Math.min(0.62, 0.2 + similarity * 0.42);
    line.setAttribute('stroke', `rgba(170,235,255,${opacity.toFixed(3)})`);
    line.setAttribute('stroke-width', (1.1 + similarity * 2.2).toFixed(2));
    line.setAttribute('stroke-linecap', 'round');
    line.dataset.src = edge.a;
    line.dataset.dst = edge.b;
    line.dataset.baseStroke = line.getAttribute('stroke');
    line.dataset.baseWidth = line.getAttribute('stroke-width');
    frag.appendChild(line);
  }
  svg.appendChild(frag);
}

function computeAnchorPoint(node, target){
  const nodeCenterX = node.centerX ?? ((node.pos?.x || 0) + (node.width || 0) / 2);
  const nodeCenterY = node.centerY ?? ((node.pos?.y || 0) + (node.height || 0) / 2);
  const targetCenterX = target.centerX ?? ((target.pos?.x || 0) + (target.width || 0) / 2);
  const targetCenterY = target.centerY ?? ((target.pos?.y || 0) + (target.height || 0) / 2);
  let dx = targetCenterX - nodeCenterX;
  let dy = targetCenterY - nodeCenterY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if(absDx < 0.0001 && absDy < 0.0001){
    return {x: nodeCenterX, y: nodeCenterY};
  }
  const halfW = Math.max(1, (node.width || (node.el?.offsetWidth ?? 0) || 0) / 2);
  const halfH = Math.max(1, (node.height || (node.el?.offsetHeight ?? 0) || 0) / 2);
  let scaleX = Number.POSITIVE_INFINITY;
  let scaleY = Number.POSITIVE_INFINITY;
  if(absDx > 0.0001){
    scaleX = halfW / absDx;
  }
  if(absDy > 0.0001){
    scaleY = halfH / absDy;
  }
  let scale = Math.min(scaleX, scaleY);
  if(!Number.isFinite(scale) || scale <= 0){
    scale = 0;
  }
  scale = Math.min(scale, 1);
  if(scale === 0){
    return {x: nodeCenterX, y: nodeCenterY};
  }
  const anchorX = nodeCenterX + dx * scale;
  const anchorY = nodeCenterY + dy * scale;
  const borderDx = anchorX - nodeCenterX;
  const borderDy = anchorY - nodeCenterY;
  const borderDist = Math.sqrt(borderDx * borderDx + borderDy * borderDy) || 1;
  const outward = 4;
  const normalizedX = borderDx / borderDist;
  const normalizedY = borderDy / borderDist;
  return {
    x: anchorX + normalizedX * outward,
    y: anchorY + normalizedY * outward
  };
}

function setupHoverHighlights(nodes, linkLayer){
  if(!linkLayer) return;
  const connectionMap = new Map();
  const lines = Array.from(linkLayer.querySelectorAll('line'));
  for(const line of lines){
    const src = Number(line.dataset.src);
    const dst = Number(line.dataset.dst);
    if(Number.isNaN(src) || Number.isNaN(dst)) continue;
    if(!connectionMap.has(src)) connectionMap.set(src, []);
    if(!connectionMap.has(dst)) connectionMap.set(dst, []);
    connectionMap.get(src).push(line);
    connectionMap.get(dst).push(line);
  }

  const applyLineHighlight = (line, active)=>{
    if(!line) return;
    if(active){
      if(!line.dataset.baseStroke){
        line.dataset.baseStroke = line.getAttribute('stroke') || '';
      }
      if(!line.dataset.baseWidth){
        line.dataset.baseWidth = line.getAttribute('stroke-width') || '1.6';
      }
      line.classList.add('link--highlight');
      line.style.stroke = 'rgba(255,255,255,0.94)';
      const baseWidth = parseFloat(line.dataset.baseWidth) || 1.6;
      line.style.strokeWidth = (baseWidth + 1.1).toFixed(2);
      line.style.filter = 'drop-shadow(0 0 10px rgba(255,255,255,0.95)) drop-shadow(0 0 28px rgba(115,255,214,0.7))';
    }else{
      line.classList.remove('link--highlight');
      if(line.dataset.baseStroke){
        line.style.stroke = line.dataset.baseStroke;
      }else{
        line.style.removeProperty('stroke');
      }
      if(line.dataset.baseWidth){
        line.style.strokeWidth = line.dataset.baseWidth;
      }else{
        line.style.removeProperty('stroke-width');
      }
      line.style.filter = '';
    }
  };

  nodes.forEach((nodeRef, index)=>{
    const el = nodeRef && nodeRef.el;
    if(!el) return;
    const highlightOn = ()=>{
      el.classList.add('card--highlight');
      const linesForNode = connectionMap.get(index);
      if(linesForNode){
        linesForNode.forEach(line => applyLineHighlight(line, true));
      }
    };
    const highlightOff = ()=>{
      el.classList.remove('card--highlight');
      const linesForNode = connectionMap.get(index);
      if(linesForNode){
        linesForNode.forEach(line => applyLineHighlight(line, false));
      }
    };
    el.addEventListener('mouseenter', highlightOn);
    el.addEventListener('mouseleave', highlightOff);
    el.addEventListener('focus', highlightOn, {passive:true});
    el.addEventListener('blur', highlightOff, {passive:true});
  });
}
