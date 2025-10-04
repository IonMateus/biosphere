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
  'zBl4ckUser'
];

function createMemberCard(user){
  const div = document.createElement('div');
  div.className = 'member';
  div.innerHTML = `
    <img src="${user.avatar_url}" alt="${user.name || user.login}" loading="lazy" />
    <h3>${user.name || user.login}</h3>
    <p>@${user.login}</p>
  `;
  return div;
}

async function initTeam(){
  const grid = document.getElementById('team-grid');
  if(!grid) return;
  const fetches = GITHUB_USERS.map(u => fetch(`https://api.github.com/users/${u}`).then(r=>{
    if(!r.ok) throw new Error(`Failed ${u}`);
    return r.json();
  }).catch(err=>({login:u, name:u, avatar_url:'./assets/biospherelogo.png'})));

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
function initVideo(){
  const vids = document.querySelectorAll('video');
  vids.forEach(v=>{
    if(window.innerWidth < 600) v.setAttribute('controls','');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initHero();
  initTeam();
  initVideo();
});
