// cards.js - create card elements and scatter them on the stage
export function createCard(article){
  const el = document.createElement('article'); el.className = 'card';
  const h = document.createElement('h3'); h.textContent = article.title || 'Untitled'; el.appendChild(h);
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
  const width = opts.width || 8000; const height = opts.height || 8000; const margin = 60;
  const rng = opts.rng || Math.random;
  const frag = document.createDocumentFragment();
  const placed = [];
  for(let i=0;i<articles.length;i++){
    const a = articles[i];
    const node = createCard(a);
    // random position but avoid exact overlap naive
    let x,y; let attempts=0;
    do{
      x = Math.floor((rng() * (width - margin*2)) - (width/2 - margin));
      y = Math.floor((rng() * (height - margin*2)) - (height/2 - margin));
      attempts++;
    }while(overlaps(x,y,placed) && attempts < 12);
    node.style.left = `${x}px`; node.style.top = `${y}px`;
    placed.push({x,y,w:240,h:120});
    frag.appendChild(node);
  }
  stage.appendChild(frag);
  console.log('[cards] scattered', articles.length);
}

function overlaps(x,y,placed){
  for(const p of placed){
    if(Math.abs(p.x - x) < 220 && Math.abs(p.y - y) < 140) return true;
  }
  return false;
}
