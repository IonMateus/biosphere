/* Combined home JS: nav, hero, team (GitHub API), video init */

/* NAV: smooth scroll for internal links */
function initNav(){
  const headerHeight = document.querySelector('.site-header')?.offsetHeight || 64;
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(href.length>1){
        e.preventDefault();
        const el = document.querySelector(href);
        if(el){
          const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 8; // small gap
          window.scrollTo({top,behavior:'smooth'});
        }
      }
    });
  });
}

/* HERO: simple appearance tweak */
function initHero(){
  const hero = document.querySelector('.hero');
  if(!hero) return;
  setTimeout(()=>hero.classList.add('hero--visible'),250);
}

/* TEAM: fetch GitHub users and render cards */
const GITHUB_USERS = [
  'DanielDoriganCC',
  'anacmsil',
  'ArthurGamaJorge',
  'sofiakawamura',
  'zBl4ckUser',
  'ionmateus'
];

function createMemberCard(user){
  const div = document.createElement('div');
  div.className = 'member';

  const img = document.createElement('img');
  // ensure we have a sensible src and fallback
  img.src = user.avatar_url || '../assets/biospherelogo.png';
  img.alt = user.name || user.login;
  img.loading = 'lazy';
  // safer onerror: only replace once to avoid infinite loop if fallback missing
  img.addEventListener('error', function imgErrorHandler(){
    console.debug('Avatar failed to load for', user.login, '— using local fallback');
    img.removeEventListener('error', imgErrorHandler);
    if(!img.src.includes('biospherelogo.png')){
      img.src = '../assets/biospherelogo.png';
    }
  });

  const h3 = document.createElement('h3');
  h3.textContent = user.name || user.login;

  const p = document.createElement('p');
  const a = document.createElement('a');
  a.className = 'username';
  a.href = `https://github.com/${user.login}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = `@${user.login}`;
  p.appendChild(a);

  div.appendChild(img);
  div.appendChild(h3);
  div.appendChild(p);

  return div;
}

async function initTeam(){
  const grid = document.getElementById('team-grid');
  if(!grid) return;
  const fetches = GITHUB_USERS.map(u => fetch(`https://api.github.com/users/${u}`)
    .then(r=>{
      if(!r.ok){
        console.warn(`GitHub fetch for ${u} returned status ${r.status}`);
        throw new Error(`Failed ${u} (${r.status})`);
      }
      return r.json();
    })
    .catch(err=>{
      // return a minimal fallback user object with local avatar
      console.debug('Using fallback user for', u, err && err.message);
      return {login:u, name:u, avatar_url:'../assets/biospherelogo.png'};
    })
  );

  const users = await Promise.all(fetches);
  users.forEach(u=>{
    const card = createMemberCard(u);
    // link to profile
    const a = document.createElement('a');
    a.href = `https://github.com/${u.login}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(card);
    grid.appendChild(a);
  });
}

/* VIDEO: ensure fallback behaviour for plain <video> tags (not used for iframe) */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initHero();
  initTeam();
});
