import {PanZoom} from './panzoom.js';
import {GridCanvas} from './grid.js';
import {loadDataset} from './data-loader.js';
import {scatterCards} from './cards.js';

const canvas = document.getElementById('grid-canvas');
const viewport = document.querySelector('.viewport');
const stage = document.getElementById('stage');
const searchInput = document.getElementById('filter-search');
const journalSelect = document.getElementById('filter-journal');
const affiliationSelect = document.getElementById('filter-affiliation');
const authorInput = document.getElementById('filter-author-input');
const authorDatalist = document.getElementById('author-suggestions');
const authorChips = document.getElementById('selected-authors');
const yearFromInput = document.getElementById('filter-year-from');
const yearToInput = document.getElementById('filter-year-to');
const clearButton = document.getElementById('filters-clear');
const filterForm = document.getElementById('filter-form');
const resultCount = document.getElementById('result-count');
const modal = document.getElementById('article-modal');
const modalDialog = modal?.querySelector('.modal__dialog') ?? null;
const modalTitle = document.getElementById('modal-title');
const modalMeta = document.getElementById('modal-meta');
const modalAuthors = document.getElementById('modal-authors');
const modalAuthorsSection = document.getElementById('modal-authors-section');
const modalAffiliations = document.getElementById('modal-affiliations');
const modalAffiliationsSection = document.getElementById('modal-affiliations-section');
const modalAbstractSection = document.getElementById('modal-abstract-section');
const modalAbstractEl = document.getElementById('modal-abstract');
const modalTerms = document.getElementById('modal-terms');
const modalTermsSection = document.getElementById('modal-terms-section');
const modalLinks = document.getElementById('modal-links');
const modalCitationSection = document.getElementById('modal-citation-section');
const modalCitationText = document.getElementById('modal-citation');
const modalCopyCitationBtn = document.getElementById('modal-copy-citation');
const modalCitationFeedback = document.getElementById('modal-citation-feedback');

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
panzoom.onChange = (s)=>{ updateZoomOutput(s); };

// call once to sync UI
updateZoomOutput({scale: panzoom.scale, translate: panzoom.translate});

const filterState = {
  search: 'bone',
  journal: '',
  affiliation: '',
  authors: [],
  yearFrom: null,
  yearTo: null
};

let allItems = [];
let filteredItems = [];
let searchDebounce = null;
const applyButton = document.getElementById('filters-apply');
const loadingSpinner = document.getElementById('loading-spinner');
let availableAuthors = [];
let focusFrame = null;
let lastFocusedElement = null;
let isModalVisible = false;
let activeArticleId = null;
let currentRenderedItems = [];

function updateResultCountDisplay(count = 0){
  if(!resultCount) return;
  if(!allItems.length){
    resultCount.textContent = 'Loading…';
    return;
  }
  const plural = count === 1 ? '' : 's';
  resultCount.textContent = `${count} result${plural} of ${allItems.length}`;
}

function fitViewToLayout(layout){
  if(!layout) return;
  const rect = viewport.getBoundingClientRect();
  if(!(rect.width && rect.height)){
    panzoom.refreshContent();
    return;
  }
  const bounds = layout.bounds || {width: 0, height: 0};
  const padding = Math.max(bounds.width, bounds.height) * 0.12 + 720;
  const fitScale = bounds.width && bounds.height
    ? Math.min(
        panzoom.maxScale,
        Math.max(
          panzoom.minScale,
          Math.min(
            rect.width / Math.max(1, bounds.width + padding),
            rect.height / Math.max(1, bounds.height + padding)
          )
        )
      )
    : panzoom.scale;

  if(Number.isFinite(fitScale) && fitScale > 0){
    panzoom.setScale(Math.min(1.35, fitScale));
  }

  if(layout.center){
    const scaledCenterX = layout.center.x * panzoom.scale;
    const scaledCenterY = layout.center.y * panzoom.scale;
    panzoom.setTranslate(rect.width / 2 - scaledCenterX, rect.height / 2 - scaledCenterY);
  }else{
    panzoom.refreshContent();
  }
}

function renderArticles(list, {resetView = false} = {}){
  const items = Array.isArray(list) ? list : [];
  const MAX_RENDER = 300; // limit to avoid rendering extremely large numbers of cards
  const total = items.length;
  const toRender = items.slice(0, MAX_RENDER);
  currentRenderedItems = toRender.slice();
  if(!items.length){
    closeArticleModal();
    stage.innerHTML = '';
    stage.style.width = '100%';
    stage.style.height = '100%';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No results found. Try adjusting your search or filters.';
    stage.appendChild(empty);
    panzoom.refreshContent();
    return;
  }

  const layout = scatterCards(stage, currentRenderedItems, {});
  // show a partial-results notice when we only rendered a subset
  const existingNote = stage.querySelector('.partial-note');
  if(existingNote) existingNote.remove();
  if(total > MAX_RENDER){
    const note = document.createElement('div');
    note.className = 'partial-note';
    note.textContent = `Showing ${MAX_RENDER.toLocaleString()} of ${total.toLocaleString()} results — refine filters to narrow results.`;
    note.style.position = 'absolute';
    note.style.right = '18px';
    note.style.top = '18px';
    note.style.padding = '8px 12px';
    note.style.background = 'rgba(0,0,0,0.6)';
    note.style.border = '1px solid rgba(255,255,255,0.06)';
    note.style.borderRadius = '10px';
    note.style.color = 'var(--muted)';
    note.style.zIndex = 90;
    stage.appendChild(note);
  }
  if(resetView){
    fitViewToLayout(layout);
  }else{
    panzoom.refreshContent();
  }
}

function matchesSearchTerm(item, term){
  if(!term) return true;
  const haystack = [
    item.title,
    item.abstract,
    Array.isArray(item.terms) ? item.terms.join(' ') : '',
    Array.isArray(item.authors) ? item.authors.join(' ') : ''
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

function matchesJournal(item, journal){
  if(!journal) return true;
  if(!item.journal) return false;
  return String(item.journal).toLowerCase() === journal.toLowerCase();
}

function matchesAffiliation(item, affiliation){
  if(!affiliation) return true;
  if(!Array.isArray(item.affiliations) || !item.affiliations.length) return false;
  const target = affiliation.toLowerCase();
  return item.affiliations.some(value => String(value).toLowerCase() === target);
}

function matchesAuthors(item, authors){
  if(!authors || !authors.length) return true;
  if(!Array.isArray(item.authors) || !item.authors.length) return false;
  const haystack = item.authors.map(name => String(name).toLowerCase());
  return authors.every(author => haystack.includes(author.toLowerCase()));
}

function matchesYear(item, from, to){
  if(from === null && to === null) return true;
  if(typeof item.year !== 'number') return false;
  if(from !== null && item.year < from) return false;
  if(to !== null && item.year > to) return false;
  return true;
}

function applyFilters({resetView = false} = {}){
  const searchTerm = filterState.search.trim().toLowerCase();
  filteredItems = allItems.filter(item =>
    matchesSearchTerm(item, searchTerm) &&
    matchesJournal(item, filterState.journal) &&
    matchesAffiliation(item, filterState.affiliation) &&
    matchesAuthors(item, filterState.authors) &&
    matchesYear(item, filterState.yearFrom, filterState.yearTo)
  );

  updateResultCountDisplay(filteredItems.length);
  renderArticles(filteredItems, {resetView});
  if(isModalVisible && activeArticleId){
    const stillVisible = filteredItems.some(item => item.id === activeArticleId);
    if(!stillVisible){
      closeArticleModal();
    }
  }
  if(filteredItems.length){
    scheduleFocusOnFirstResult();
  }
}

function populateSelect(selectEl, values){
  if(!selectEl || !Array.isArray(values)) return;
  while(selectEl.options.length > 1){
    selectEl.remove(1);
  }
  const frag = document.createDocumentFragment();
  for(const value of values){
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    frag.appendChild(option);
  }
  selectEl.appendChild(frag);
}

function populateDatalist(datalistEl, values){
  if(!datalistEl || !Array.isArray(values)) return;
  datalistEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(const value of values){
    const option = document.createElement('option');
    option.value = value;
    frag.appendChild(option);
  }
  datalistEl.appendChild(frag);
}

function prepareFilters(items){
  filterState.authors = [];
  const journals = new Set();
  const affiliations = new Set();
  const authors = new Set();
  const years = [];
  for(const item of items){
    if(item.journal) journals.add(item.journal);
    if(Array.isArray(item.affiliations)) item.affiliations.forEach(value => { if(value) affiliations.add(value); });
    if(Array.isArray(item.authors)) item.authors.forEach(a => { if(a) authors.add(a); });
    if(typeof item.year === 'number') years.push(item.year);
  }

  const sortedJournals = Array.from(journals).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
  const sortedAffiliations = Array.from(affiliations).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
  const sortedAuthors = Array.from(authors).sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'}));
  populateSelect(journalSelect, sortedJournals);
  populateSelect(affiliationSelect, sortedAffiliations);
  populateDatalist(authorDatalist, sortedAuthors);
  availableAuthors = sortedAuthors;
  if(journalSelect) journalSelect.value = '';
  if(affiliationSelect) affiliationSelect.value = '';
  if(authorInput) authorInput.value = '';
  renderAuthorChips();

  if(years.length && (yearFromInput || yearToInput)){
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    if(yearFromInput){
      yearFromInput.placeholder = `From ${minYear}`;
      yearFromInput.min = String(minYear);
      yearFromInput.max = String(maxYear);
    }
    if(yearToInput){
      yearToInput.placeholder = `To ${maxYear}`;
      yearToInput.min = String(minYear);
      yearToInput.max = String(maxYear);
    }
  }
}

function renderAuthorChips(){
  if(!authorChips) return;
  authorChips.innerHTML = '';
  if(!filterState.authors.length) return;
  for(const author of filterState.authors){
    const chip = document.createElement('span');
    chip.className = 'chip';
    const text = document.createElement('span');
    text.textContent = author;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Remove author ${author}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeAuthor(author));
    chip.appendChild(text);
    chip.appendChild(removeBtn);
    authorChips.appendChild(chip);
  }
}

function canonicalizeAuthor(value){
  const lower = value.toLowerCase();
  const match = availableAuthors.find(name => name.toLowerCase() === lower);
  return match || value;
}

function addAuthor(value){
  const raw = value?.trim();
  if(!raw) return;
  const canonical = canonicalizeAuthor(raw);
  const exists = filterState.authors.some(name => name.toLowerCase() === canonical.toLowerCase());
  if(exists) return;
  filterState.authors.push(canonical);
  renderAuthorChips();
}

function removeAuthor(value){
  const idx = filterState.authors.findIndex(name => name.toLowerCase() === value.toLowerCase());
  if(idx === -1) return;
  filterState.authors.splice(idx, 1);
  renderAuthorChips();
}

function commitAuthorFromInput(){
  if(!authorInput) return;
  const value = authorInput.value;
  if(!value || !value.trim()) return;
  addAuthor(value);
  authorInput.value = '';
}

function bindFilterEvents(){
  if(filterForm){
    // prevent native submit - user must click the Search button to apply filters
    filterForm.addEventListener('submit', evt => {
      evt.preventDefault();
    });
  }

  if(searchInput){
    // update internal state but do not auto-apply filters while typing (avoid expensive re-renders)
    searchInput.value = filterState.search || '';
    searchInput.addEventListener('input', evt => {
      const value = evt.target.value;
      filterState.search = value || '';
      // keep debounce value for legacy but do not auto-apply
      if(searchDebounce) window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {/* noop: manual apply via button */}, 250);
    });
  }

  if(journalSelect){
    journalSelect.addEventListener('change', evt => {
      filterState.journal = evt.target.value || '';
      // do not auto-apply; wait for Search button
    });
  }

  if(affiliationSelect){
    affiliationSelect.addEventListener('change', evt => {
      filterState.affiliation = evt.target.value || '';
    });
  }

  if(authorInput){
    authorInput.addEventListener('keydown', evt => {
      if(evt.key === 'Enter' || evt.key === ','){
        evt.preventDefault();
        commitAuthorFromInput();
      }
    });
    authorInput.addEventListener('change', () => {
      commitAuthorFromInput();
    });
  }

  const parseYear = value => {
    const num = Number.parseInt(value, 10);
    return Number.isFinite(num) ? num : null;
  };

  if(yearFromInput){
    yearFromInput.addEventListener('change', evt => {
      filterState.yearFrom = parseYear(evt.target.value);
    });
  }

  if(yearToInput){
    yearToInput.addEventListener('change', evt => {
      filterState.yearTo = parseYear(evt.target.value);
    });
  }

  if(clearButton){
    clearButton.addEventListener('click', () => {
      filterState.search = '';
      filterState.journal = '';
      filterState.affiliation = '';
      filterState.authors = [];
      filterState.yearFrom = null;
      filterState.yearTo = null;
      if(filterForm) filterForm.reset();
      if(searchDebounce){
        window.clearTimeout(searchDebounce);
        searchDebounce = null;
      }
      if(searchInput) searchInput.value = '';
      if(journalSelect) journalSelect.value = '';
      if(affiliationSelect) affiliationSelect.value = '';
      if(authorInput) authorInput.value = '';
      renderAuthorChips();
      closeArticleModal();
      updateResultCountDisplay(allItems.length);
      // do not auto-apply filters on clear; user must press Search
    });
  }

  if(applyButton){
    applyButton.addEventListener('click', async () => {
      // show spinner
      if(loadingSpinner) loadingSpinner.setAttribute('aria-hidden', 'false');
      try{
        // small debounce to allow UI to show spinner
        await new Promise(r => setTimeout(r, 80));
        applyFilters({resetView: true});
      }finally{
        if(loadingSpinner) loadingSpinner.setAttribute('aria-hidden', 'true');
      }
    });
  }
}

function scheduleFocusOnFirstResult(){
  if(focusFrame){
    cancelAnimationFrame(focusFrame);
    focusFrame = null;
  }
  focusFrame = requestAnimationFrame(() => {
    focusFrame = null;
    focusOnFirstResult();
  });
}

function focusOnFirstResult(){
  if(!stage || !viewport || !panzoom) return;
  const firstCard = stage.querySelector('.card');
  if(!firstCard) return;
  const rect = viewport.getBoundingClientRect();
  if(!(rect.width && rect.height)) return;
  const parseNumber = value => {
    if(typeof value === 'number') return value;
    if(typeof value === 'string'){
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  const x = parseNumber(firstCard.dataset.x) || parseNumber(firstCard.style.left);
  const y = parseNumber(firstCard.dataset.y) || parseNumber(firstCard.style.top);
  const width = parseNumber(firstCard.dataset.w) || firstCard.offsetWidth || 260;
  const height = parseNumber(firstCard.dataset.h) || firstCard.offsetHeight || 160;
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const scale = panzoom.scale;
  const targetTx = rect.width / 2 - centerX * scale;
  const targetTy = rect.height / 2 - centerY * scale;
  panzoom.setTranslate(targetTx, targetTy);
}

function setupModalBase(){
  if(!modal) return;
  modal.addEventListener('click', evt => {
    const trigger = evt.target.closest('[data-modal-close]');
    if(trigger){
      evt.preventDefault();
      closeArticleModal();
    }
  });

  document.addEventListener('keydown', evt => {
    if(evt.key === 'Escape' && isModalVisible){
      evt.preventDefault();
      closeArticleModal();
    }
  });

  if(modalCopyCitationBtn){
    modalCopyCitationBtn.addEventListener('click', async () => {
      if(!modalCitationText?.textContent) return;
      const citation = modalCitationText.textContent.trim();
      if(!citation) return;
      try{
        await navigator.clipboard.writeText(citation);
        showCitationFeedback('Citation copied to clipboard.');
      }catch(err){
        console.warn('[modal] Failed to copy citation', err);
        showCitationFeedback('Unable to copy automatically. Please copy manually.');
      }
    });
  }
}

function openArticleModal(article){
  if(!article || !modal || !modalDialog) return;
  populateArticleModal(article);
  activeArticleId = article.id || null;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  isModalVisible = true;
  modal.classList.add('modal--visible');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('has-open-modal');
  modalDialog.scrollTop = 0;
  requestAnimationFrame(() => {
    modalDialog.focus();
  });
}

function closeArticleModal(){
  if(!modal || !isModalVisible) return;
  isModalVisible = false;
  modal.classList.remove('modal--visible');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('has-open-modal');
  activeArticleId = null;
  if(lastFocusedElement && typeof lastFocusedElement.focus === 'function'){
    lastFocusedElement.focus();
  }
}

function populateArticleModal(article){
  if(!article) return;
  if(modalTitle) modalTitle.textContent = article.title || 'Untitled';
  if(modalMeta){
    const metaSegments = [];
    if(typeof article.year === 'number') metaSegments.push(String(article.year));
    if(article.journal) metaSegments.push(article.journal);
    if(article.doi) metaSegments.push(article.doi);
    modalMeta.textContent = metaSegments.join(' • ');
    modalMeta.hidden = metaSegments.length === 0;
  }
  renderAuthorSection(article);
  renderAffiliationSection(article);
  renderAbstractSection(article);
  renderTermsSection(article);
  renderCitationSection(article);
  renderLinksSection(article);
}

function renderAuthorSection(article){
  if(!modalAuthors || !modalAuthorsSection) return;
  modalAuthors.innerHTML = '';
  const authors = Array.isArray(article.authors) ? article.authors.filter(Boolean) : [];
  if(!authors.length){
    modalAuthorsSection.hidden = true;
    return;
  }
  modalAuthorsSection.hidden = false;
  authors.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'modal__chip';
    chip.setAttribute('role', 'listitem');
    chip.textContent = name;
    modalAuthors.appendChild(chip);
  });
}

function renderAffiliationSection(article){
  if(!modalAffiliations || !modalAffiliationsSection) return;
  modalAffiliations.innerHTML = '';
  const affiliations = Array.isArray(article.affiliations) ? article.affiliations.filter(Boolean) : [];
  if(!affiliations.length){
    modalAffiliationsSection.hidden = true;
    return;
  }
  modalAffiliationsSection.hidden = false;
  affiliations.forEach(value => {
    const item = document.createElement('div');
    item.className = 'modal__list-item';
    item.setAttribute('role', 'listitem');
    item.textContent = value;
    modalAffiliations.appendChild(item);
  });
}

function renderAbstractSection(article){
  if(!modalAbstractEl || !modalAbstractSection) return;
  const text = (article.abstract || '').trim();
  modalAbstractSection.hidden = false;
  modalAbstractEl.textContent = text || 'No abstract available for this article.';
}

function renderTermsSection(article){
  if(!modalTerms || !modalTermsSection) return;
  modalTerms.innerHTML = '';
  const terms = Array.isArray(article.terms) ? article.terms : Array.isArray(article.topics) ? article.topics : [];
  const uniqueTerms = Array.from(new Set(terms.map(term => String(term).trim()).filter(Boolean)));
  if(!uniqueTerms.length){
    modalTermsSection.hidden = true;
    return;
  }
  modalTermsSection.hidden = false;
  uniqueTerms.slice(0, 12).forEach(term => {
    const chip = document.createElement('span');
    chip.className = 'modal__chip';
    chip.setAttribute('role', 'listitem');
    chip.textContent = term;
    modalTerms.appendChild(chip);
  });
}

function renderLinksSection(article){
  if(!modalLinks) return;
  modalLinks.innerHTML = '';
  const links = [];
  if(article.link) links.push({href: article.link, label: 'View article', icon: 'link'});
  if(article.pdf) links.push({href: article.pdf, label: 'Download PDF', icon: 'pdf'});
  const doiHref = buildDoiHref(article.doi);
  if(doiHref && !links.some(item => item.href === doiHref)){
    links.push({href: doiHref, label: 'View DOI', icon: 'link'});
  }
  if(!links.length){
    modalLinks.style.display = 'none';
    return;
  }
  modalLinks.style.display = '';
  links.forEach(item => {
    const anchor = document.createElement('a');
    anchor.className = 'modal__link';
    anchor.href = item.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    const icon = createModalIcon(item.icon);
    if(icon) anchor.appendChild(icon);
    anchor.appendChild(document.createTextNode(item.label));
    modalLinks.appendChild(anchor);
  });
}

function renderCitationSection(article){
  if(!modalCitationSection || !modalCitationText) return;
  const citation = buildCitationString(article);
  if(!citation){
    modalCitationSection.hidden = true;
    modalCitationText.textContent = '';
    if(modalCopyCitationBtn) modalCopyCitationBtn.disabled = true;
    return;
  }
  modalCitationSection.hidden = false;
  modalCitationText.textContent = citation;
  if(modalCopyCitationBtn) modalCopyCitationBtn.disabled = false;
  showCitationFeedback('');
}

function showCitationFeedback(message){
  if(!modalCitationFeedback) return;
  modalCitationFeedback.textContent = message || '';
}

function createModalIcon(type){
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('modal__icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  let d = '';
  if(type === 'pdf'){
    d = 'M6 2h7l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 2H6v16h10V9h-5V4zm1 5h3l-3-3v3zM8 12h2.5a1.5 1.5 0 110 3H9v2H8v-5zm1 1v1h1.5a.5.5 0 000-1H9z';
  }else{
    d = 'M7.05 15.536a3.5 3.5 0 010-4.95l2.122-2.122a3.5 3.5 0 014.95 0l.707.707-1.414 1.414-.707-.707a1.5 1.5 0 00-2.122 0l-2.122 2.122a1.5 1.5 0 002.122 2.122l1.06-1.06 1.414 1.414-1.06 1.06a3.5 3.5 0 01-4.95 0zm5.657-7.778l1.06-1.06a3.5 3.5 0 014.95 4.95l-2.122 2.122a3.5 3.5 0 01-4.95 0l-.707-.707 1.414-1.414.707.707a1.5 1.5 0 002.122 0l2.122-2.122a1.5 1.5 0 00-2.122-2.122l-1.06 1.06-1.414-1.414z';
  }
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function buildDoiHref(doi){
  if(!doi) return null;
  if(typeof doi !== 'string') return null;
  const trimmed = doi.trim();
  if(!trimmed) return null;
  return trimmed.startsWith('http') ? trimmed : `https://doi.org/${trimmed}`;
}

function initializeStageInteractions(){
  const delegationRoot = stage || document;
  if(!delegationRoot) return;

  const handleActivation = evt => {
    const card = evt.target.closest?.('.card');
    if(!card) return;
    const article = getArticleForCard(card);
    if(!article) return;
    evt.preventDefault();
    openArticleModal(article);
  };

  delegationRoot.addEventListener('click', handleActivation);

  delegationRoot.addEventListener('keydown', evt => {
    if(evt.key !== 'Enter' && evt.key !== ' ') return;
    const card = evt.target.closest?.('.card');
    if(!card) return;
    const article = getArticleForCard(card);
    if(!article) return;
    evt.preventDefault();
    openArticleModal(article);
  });
}

function buildCitationString(article){
  if(!article) return '';
  const authorsSegment = formatAuthorsForCitation(article.authors);
  const yearSegment = Number.isFinite(article.year) ? `(${article.year}).` : '(n.d.).';
  const titleSegment = formatTitleForCitation(article.title);
  const journalSegment = formatJournalForCitation(article.journal);
  const accessUrl = buildCitationAccessUrl(article);
  const segments = [];
  if(authorsSegment) segments.push(authorsSegment);
  segments.push(yearSegment);
  segments.push(titleSegment);
  if(journalSegment) segments.push(journalSegment);
  if(accessUrl) segments.push(accessUrl);
  return segments
    .map(segment => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

function formatAuthorsForCitation(list){
  if(!Array.isArray(list) || !list.length) return '';
  const formatted = list
    .map(value => formatCitationAuthor(value))
    .filter(Boolean);
  if(!formatted.length) return '';
  const ensureTrailingPeriod = value => value.endsWith('.') ? value : `${value}.`;
  const stripTrailingPeriod = value => value.endsWith('.') ? value.slice(0, -1) : value;
  const sanitized = formatted.map(name => ensureTrailingPeriod(name.replace(/\s+/g, ' ').trim()));
  if(sanitized.length === 1){
    return sanitized[0];
  }
  if(sanitized.length === 2){
    const first = stripTrailingPeriod(sanitized[0]);
    const second = sanitized[1];
    return `${first}., & ${second}`;
  }
  const maxAuthors = 20;
  if(sanitized.length > maxAuthors){
    const leading = sanitized.slice(0, maxAuthors - 1).map(name => `${stripTrailingPeriod(name)}.`);
    const last = sanitized[sanitized.length - 1];
    return `${leading.join(', ')}, … ${last}`;
  }
  const allButLast = sanitized.slice(0, -1).map(name => `${stripTrailingPeriod(name)}.`);
  const lastAuthor = sanitized[sanitized.length - 1];
  return `${allButLast.join(', ')}, & ${lastAuthor}`;
}

function formatCitationAuthor(name){
  if(!name) return '';
  const clean = String(name).replace(/\s+/g, ' ').trim();
  if(!clean) return '';
  const parts = clean.split(' ');
  if(!parts.length) return '';
  const lastName = parts.pop();
  if(!parts.length){
    return capitalizeName(lastName);
  }
  const initials = parts
    .filter(Boolean)
    .map(part => (part[0] ? `${part[0].toUpperCase()}.` : ''))
    .filter(Boolean)
    .join(' ');
  const normalizedLast = capitalizeName(lastName);
  return initials ? `${normalizedLast}, ${initials}` : normalizedLast;
}

function formatTitleForCitation(title){
  if(!title) return 'Untitled.';
  const clean = String(title).replace(/\s+/g, ' ').trim();
  if(!clean) return 'Untitled.';
  const trimmed = clean.replace(/[.?!]+$/g, '').trim();
  return `${trimmed || 'Untitled'}.`;
}

function formatJournalForCitation(journal){
  if(!journal) return '';
  const clean = String(journal).replace(/\s+/g, ' ').trim();
  if(!clean) return '';
  const trimmed = clean.replace(/[.]+$/g, '').trim();
  return trimmed ? `${trimmed}.` : '';
}

function buildCitationAccessUrl(article){
  if(!article) return '';
  const doiHref = buildDoiHref(article.doi);
  if(doiHref) return doiHref;
  const link = typeof article.link === 'string' ? article.link.trim() : '';
  if(link) return link;
  const pdf = typeof article.pdf === 'string' ? article.pdf.trim() : '';
  if(pdf) return pdf;
  return '';
}

function getArticleForCard(card){
  if(!card) return null;
  const index = Number.parseInt(card.dataset.nodeIndex, 10);
  if(Number.isFinite(index) && index >= 0 && index < currentRenderedItems.length){
    return currentRenderedItems[index];
  }
  const articleId = card.dataset.articleId;
  if(articleId){
    return currentRenderedItems.find(item => {
      if(!item) return false;
      const identifiers = [item.id, item.uid, item.doi];
      return identifiers.some(value => value && String(value) === articleId);
    }) || null;
  }
  return null;
}

function capitalizeName(value){
  if(!value) return '';
  const base = String(value).trim();
  if(!base) return '';
  return base
    .split(/([-\s'])/)
    .map(part => {
      if(part === '-' || part === ' ' || part === "'" || part === '') return part;
      if(/[A-Z]/.test(part)) return part;
      if(!/[A-Za-z]/.test(part)) return part;
      const first = part.charAt(0).toUpperCase();
      const rest = part.slice(1).toLowerCase();
      return first + rest;
    })
    .join('');
}

setupModalBase();
initializeStageInteractions();

// load and render
async function init(){
  const DATA_PATH = new URL('../../data/dataset.json', import.meta.url).href;
  console.log('[main] loading dataset from', DATA_PATH);
  try{
    // show spinner during load
    if(loadingSpinner) loadingSpinner.setAttribute('aria-hidden', 'false');
    allItems = await loadDataset(DATA_PATH);
    console.log('[main] dataset loaded, items:', allItems.length);

    prepareFilters(allItems);
    bindFilterEvents();
    // initial state: do not render everything — apply the default 'bone' search
    updateResultCountDisplay(0);
    applyFilters({resetView: true});
    console.log('[main] initial render complete, DOM children:', stage.childElementCount);
    if(loadingSpinner) loadingSpinner.setAttribute('aria-hidden', 'true');
  }catch(err){
    console.error('[main] Failed to load dataset', err);
    const t = document.createElement('div');
    t.style.padding = '20px';
    t.textContent = 'Failed to load data.';
    stage.appendChild(t);
  }
}

init();
