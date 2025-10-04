import {PanZoom} from './panzoom.js';
import {GridCanvas} from './grid.js';
import {loadDataset} from './data-loader.js';
import {scatterCards} from './cards.js';

const canvas = document.getElementById('grid-canvas');
const viewport = document.querySelector('.viewport');
const stage = document.getElementById('stage');

console.log('[main] init');

// create panzoom without onChange to avoid early callback before grid exists
const panzoom = new PanZoom(viewport, canvas, {});
console.log('[main] panzoom created', {scale: panzoom.scale});

// create grid (uses panzoom)
const grid = new GridCanvas(canvas, panzoom);
console.log('[main] grid created');

function updateZoomOutput(state){
  const out = document.getElementById('zoom-output'); if(out) out.textContent = state.scale.toFixed(2);
  try{ grid.draw(); }catch(e){ console.warn('[main] grid.draw() failed', e); }
}

// now set the onChange handler so future transforms update the UI
panzoom.onChange = (s)=>{ updateZoomOutput(s); console.log('[panzoom] onChange', s); };

// call once to sync UI
updateZoomOutput({scale: panzoom.scale, translate: panzoom.translate});

// load and render
async function init(){
  const DATA_PATH = new URL('../../data/dataset.json', import.meta.url).href;
  console.log('[main] loading dataset from', DATA_PATH);
  try{
    // limit to keep UI responsive
    const items = await loadDataset(DATA_PATH, {limit: 250});
    console.log('[main] dataset loaded, items:', items.length);
    // scatter items
    console.log('[main] scattering cards...');
    scatterCards(stage, items, {width:8000,height:8000});
    console.log('[main] scattering complete, DOM children:', stage.childElementCount);
    panzoom.refreshContent();
  }catch(err){
    console.error('[main] Failed to load dataset', err);
    const t = document.createElement('div'); t.style.padding = '20px'; t.textContent = 'Erro ao carregar dados.'; stage.appendChild(t);
  }
}

init();
