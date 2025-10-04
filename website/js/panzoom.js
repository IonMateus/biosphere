// panzoom.js - provides pan/zoom state and event wiring for a container
export class PanZoom {
  constructor(container, canvas, opts = {}){
    this.container = container; // the viewport element
    this.canvas = canvas; // grid canvas for redraws
    this.scale = opts.scale || 1;
    this.minScale = opts.minScale || 0.2;
    this.maxScale = opts.maxScale || 3.5;
    // start with translate = center of container so stage (0,0) is center
    const rect = this.container.getBoundingClientRect();
    this.translate = {x: rect.width/2, y: rect.height/2};
    this.isPanning = false;
    this.last = {x:0,y:0};
    this.onChange = opts.onChange || null;
    this._zoomAnim = null;
    this._bindEvents();
    this._apply();
  }

  _bindEvents(){
    // pointer drag
    this.container.addEventListener('pointerdown', e => {
      // cancel zoom animation if active
      if(this._zoomAnim){ cancelAnimationFrame(this._zoomAnim.frame); this._zoomAnim = null; }
      this.isPanning = true; this.last = {x: e.clientX, y: e.clientY}; this.container.setPointerCapture(e.pointerId);
    });
    this.container.addEventListener('pointermove', e => {
      if(!this.isPanning) return;
      const dx = e.clientX - this.last.x; const dy = e.clientY - this.last.y;
      this.last = {x: e.clientX, y: e.clientY};
      this.translate.x += dx; this.translate.y += dy;
      this._apply();
    });
    this.container.addEventListener('pointerup', e => { this.isPanning = false; try{ this.container.releasePointerCapture?.(e.pointerId);}catch(e){} });

    // wheel zoom
    this.container.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();
      // center-based zoom: use the center of the viewport as focal point
      const cx = rect.width / 2; const cy = rect.height / 2;
      const delta = -e.deltaY * 0.0015;
      const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * (1 + delta)));

      // compute target translate so the world point under cursor stays fixed
      const oldScale = this.scale;
      const targetScale = newScale;
      const targetTx = this.translate.x + cx * (1 / targetScale - 1 / oldScale);
      const targetTy = this.translate.y + cy * (1 / targetScale - 1 / oldScale);

  // animate smoothly from current scale/translate to target
      if(this._zoomAnim){ cancelAnimationFrame(this._zoomAnim.frame); this._zoomAnim = null; }
      const startScale = this.scale; const startTx = this.translate.x; const startTy = this.translate.y;
      const duration = 220; const startTime = performance.now();
      const ease = t => 1 - Math.pow(1 - t, 3);

      const frame = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eT = ease(t);
        this.scale = startScale + (targetScale - startScale) * eT;
        this.translate.x = startTx + (targetTx - startTx) * eT;
        this.translate.y = startTy + (targetTy - startTy) * eT;
        this._apply();
        if(t < 1) this._zoomAnim.frame = requestAnimationFrame(frame);
        else this._zoomAnim = null;
      };
      this._zoomAnim = {frame: requestAnimationFrame(frame)};
    }, {passive:false});
  }

  _apply(){
    // apply transform to stage element
    const stage = this.container.querySelector('.stage');
    if(stage){
      // use matrix(s, 0, 0, s, tx, ty) so mapping is: screen = stage * s + translate
      const s = this.scale; const tx = this.translate.x; const ty = this.translate.y;
      stage.style.transform = `matrix(${s}, 0, 0, ${s}, ${tx}, ${ty})`;
    }
    // update canvas for grid redraw
    if(this.canvas && this.canvas.resize) this.canvas.resize();
    try{
      if(typeof this.onChange === 'function') this.onChange({scale:this.scale,translate:this.translate});
    }catch(e){ console.warn('[panzoom] onChange handler threw', e); }
  }

  setScale(s){ this.scale = Math.min(this.maxScale, Math.max(this.minScale, s)); this._apply(); }
  setTranslate(x,y){ this.translate.x = x; this.translate.y = y; this._apply(); }
}
