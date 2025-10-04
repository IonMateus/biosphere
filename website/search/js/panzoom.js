// panzoom.js - provides pan/zoom state and event wiring for a container
export class PanZoom {
  constructor(container, canvas, opts = {}){
    this.container = container; // the viewport element
    this.canvas = canvas; // grid canvas for redraws
    this.scale = opts.scale || 1;
    this.minScale = opts.minScale || 0.2;
    this.maxScale = opts.maxScale || 3.5;
  this.performanceThreshold = opts.performanceThreshold || 0.32;
  this.container.style.touchAction = 'none';
    // start with translate = center of container so stage (0,0) is center
    const rect = this.container.getBoundingClientRect();
    this.translate = {x: rect.width/2, y: rect.height/2};
    this.isPanning = false;
    this.last = {x:0,y:0};
    this.onChange = opts.onChange || null;
  this.stage = this.container.querySelector('.stage');
  this._linkLayer = null;
  this._lastTransformString = '';
    this._zoomAnimId = null;
    this._zoomTarget = {scale: this.scale, tx: this.translate.x, ty: this.translate.y};
    this._panFrame = null;
    this._pendingPan = {dx:0, dy:0};
  this._coarseActive = false;
  this._panStateTimer = null;
    this._bindEvents();
    this._apply();
  }

  _bindEvents(){
    // pointer drag
    this.container.addEventListener('pointerdown', e => {
      if(e.button !== 0) return;
      if(e.target?.closest('[data-panzoom-ignore]')){
        return;
      }
      // cancel zoom animation if active
      if(this._zoomAnimId != null){ cancelAnimationFrame(this._zoomAnimId); this._zoomAnimId = null; }
      this._zoomTarget = {scale: this.scale, tx: this.translate.x, ty: this.translate.y};
      this.isPanning = true; this.last = {x: e.clientX, y: e.clientY}; this.container.setPointerCapture(e.pointerId);
      this._enterPanState();
    });
    this.container.addEventListener('pointermove', e => {
      if(!this.isPanning) return;
      const dx = e.clientX - this.last.x; const dy = e.clientY - this.last.y;
      this.last = {x: e.clientX, y: e.clientY};
      this._queuePan(dx, dy);
    });
    const finalizePan = e => {
      this.isPanning = false;
      this._exitPanState();
      try{ this.container.releasePointerCapture?.(e.pointerId);}catch(err){}
    };
    this.container.addEventListener('pointerup', finalizePan);
    this.container.addEventListener('pointercancel', finalizePan);

    // wheel zoom
    this.container.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = this.container.getBoundingClientRect();

      // capture mouse position relative to viewport so zoom focuses on pointer
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const delta = -e.deltaY * 0.0015;
      const oldScale = this.scale;
      const targetScale = Math.min(this.maxScale, Math.max(this.minScale, oldScale * (1 + delta)));

      if(targetScale === oldScale) return;

      // keep the world point under the cursor anchored during zoom
      const worldX = (mx - this.translate.x) / oldScale;
      const worldY = (my - this.translate.y) / oldScale;
      const targetTx = mx - worldX * targetScale;
      const targetTy = my - worldY * targetScale;

      // animate smoothly from current scale/translate to target
      this._zoomTarget.scale = targetScale;
      this._zoomTarget.tx = targetTx;
      this._zoomTarget.ty = targetTy;

      if(this.isPanning){
        if(this._zoomAnimId != null){ cancelAnimationFrame(this._zoomAnimId); this._zoomAnimId = null; }
        this.scale = targetScale;
        this.translate.x = targetTx;
        this.translate.y = targetTy;
        this.last = {x: e.clientX, y: e.clientY};
        this._apply();
        return;
      }

      if(this._zoomAnimId == null){
        const step = () => {
          const smoothing = 0.24;
          let active = false;

          const ds = this._zoomTarget.scale - this.scale;
          if(Math.abs(ds) > 0.0005){
            this.scale += ds * smoothing;
            active = true;
          }else{
            this.scale = this._zoomTarget.scale;
          }

          const dtx = this._zoomTarget.tx - this.translate.x;
          if(Math.abs(dtx) > 0.002){
            this.translate.x += dtx * smoothing;
            active = true;
          }else{
            this.translate.x = this._zoomTarget.tx;
          }

          const dty = this._zoomTarget.ty - this.translate.y;
          if(Math.abs(dty) > 0.002){
            this.translate.y += dty * smoothing;
            active = true;
          }else{
            this.translate.y = this._zoomTarget.ty;
          }

          this._apply();

          if(active){
            this._zoomAnimId = requestAnimationFrame(step);
          }else{
            this._zoomAnimId = null;
            this._pendingPan.dx = 0;
            this._pendingPan.dy = 0;
            if(this._panFrame != null){
              cancelAnimationFrame(this._panFrame);
              this._panFrame = null;
            }
            this._exitPanState(120);
          }
        };
        this._zoomAnimId = requestAnimationFrame(step);
      }
    }, {passive:false});
  }

  _apply(){
    // apply transform to stage element
    const stage = this.stage || (this.stage = this.container.querySelector('.stage'));
    if(stage){
      // use matrix(s, 0, 0, s, tx, ty) so mapping is: screen = stage * s + translate
  const matrixScale = Number.isFinite(this.scale) ? this.scale : 1;
  const matrixTx = Number.isFinite(this.translate.x) ? this.translate.x : 0;
  const matrixTy = Number.isFinite(this.translate.y) ? this.translate.y : 0;
  const transformString = `matrix(${matrixScale.toFixed(6)}, 0, 0, ${matrixScale.toFixed(6)}, ${matrixTx.toFixed(4)}, ${matrixTy.toFixed(4)})`;
  if(transformString !== this._lastTransformString){
    stage.style.transform = transformString;
    this._lastTransformString = transformString;
  }
      if(!this._linkLayer || !this._linkLayer.isConnected){
        this._linkLayer = stage.querySelector('.link-layer');
      }
    }
    this._updatePerformanceMode();
    // update canvas for grid redraw
    if(this.canvas){
      if(typeof this.canvas.draw === 'function') this.canvas.draw();
      else if(typeof this.canvas.resize === 'function') this.canvas.resize();
    }
    try{
      if(typeof this.onChange === 'function') this.onChange({scale:this.scale,translate:this.translate});
    }catch(e){ console.warn('[panzoom] onChange handler threw', e); }
  }

  setScale(s){ this.scale = Math.min(this.maxScale, Math.max(this.minScale, s)); this._apply(); }
  setTranslate(x,y){ this.translate.x = x; this.translate.y = y; this._apply(); }

  refreshContent(){ this._apply(); }

  _queuePan(dx, dy){
    this._pendingPan.dx += dx;
    this._pendingPan.dy += dy;
    if(this._panFrame != null) return;
    this._panFrame = requestAnimationFrame(() => {
      this.translate.x += this._pendingPan.dx;
      this.translate.y += this._pendingPan.dy;
      this._pendingPan.dx = 0;
      this._pendingPan.dy = 0;
      this._panFrame = null;
      this._apply();
    });
  }

  _updatePerformanceMode(){
    const shouldBeCoarse = this.scale <= this.performanceThreshold;
    if(shouldBeCoarse === this._coarseActive) return;
    this._coarseActive = shouldBeCoarse;
    if(shouldBeCoarse){
      this.container.classList.add('viewport--coarse');
      this.stage?.classList.add('stage--coarse');
      this._linkLayer?.classList.add('link-layer--coarse');
    }else{
      this.container.classList.remove('viewport--coarse');
      this.stage?.classList.remove('stage--coarse');
      this._linkLayer?.classList.remove('link-layer--coarse');
    }
  }

  _enterPanState(){
    if(this._panStateTimer){ clearTimeout(this._panStateTimer); this._panStateTimer = null; }
    this.container.classList.add('viewport--panning');
    this.stage?.classList.add('stage--panning');
    this._linkLayer?.classList.add('link-layer--panning');
  }

  _exitPanState(delay = 80){
    if(this._panStateTimer){ clearTimeout(this._panStateTimer); }
    this._panStateTimer = setTimeout(()=>{
      this.container.classList.remove('viewport--panning');
      this.stage?.classList.remove('stage--panning');
      this._linkLayer?.classList.remove('link-layer--panning');
      this._panStateTimer = null;
    }, delay);
  }
}
