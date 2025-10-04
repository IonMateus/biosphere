// grid.js - renders a scalable grid into a canvas sized to the viewport
export class GridCanvas {
  constructor(canvas, panzoom){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.panzoom = panzoom;
    this.pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    window.addEventListener('resize', ()=>this.resize());
    this.resize();
  }

  resize(){
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(rect.width * this.pixelRatio);
    this.canvas.height = Math.round(rect.height * this.pixelRatio);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    console.log('[grid] resized', {w: this.canvas.width, h: this.canvas.height, pr: this.pixelRatio});
    this.draw();
  }

  draw(){
    const ctx = this.ctx; const w = this.canvas.width/this.pixelRatio; const h = this.canvas.height/this.pixelRatio;
    ctx.clearRect(0,0,w,h);
    // leave transparent background so body bg shows through

  // grid parameters
  const baseSpacing = 60; // px at scale 1
    const scale = this.panzoom?.scale || 1;
    const spacing = baseSpacing * scale;

    // draw grid in stage coordinates so grid aligns with stage transform
    const tx = (this.panzoom?.translate?.x || 0);
    const ty = (this.panzoom?.translate?.y || 0);
    const S = scale;

    ctx.save();
    // move to stage origin on screen and scale to stage units
    ctx.translate(tx, ty);
    ctx.scale(S, S);

    // compute visible region in stage coordinates
    const leftStage = (0 - tx) / S;
    const rightStage = (w - tx) / S;
    const topStage = (0 - ty) / S;
    const bottomStage = (h - ty) / S;

    // lines every baseSpacing in stage coordinates
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1 / Math.max(0.0001, S);

    const startX = Math.floor(leftStage / baseSpacing) * baseSpacing;
    for(let x = startX; x <= rightStage; x += baseSpacing){
      ctx.beginPath(); ctx.moveTo(x, topStage - baseSpacing); ctx.lineTo(x, bottomStage + baseSpacing); ctx.stroke();
    }

    const startY = Math.floor(topStage / baseSpacing) * baseSpacing;
    for(let y = startY; y <= bottomStage; y += baseSpacing){
      ctx.beginPath(); ctx.moveTo(leftStage - baseSpacing, y); ctx.lineTo(rightStage + baseSpacing, y); ctx.stroke();
    }

    ctx.restore();
    // debug
    // console.log('[grid] drawn', {spacing, scale});
  }
}
