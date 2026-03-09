/*
Photo and Video Editor
Single-file logic: handles image/video loading, rendering and effects.
*/

const fileInput = document.getElementById('file');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const video = document.getElementById('video');
const playPause = document.getElementById('playPause');

let srcImage = null; // Image object or null
let srcVideoLoaded = false;
let playing = false;
let animationId = null;

const scaleControl = document.getElementById('scale');
const amountControl = document.getElementById('amount');
const radiusControl = document.getElementById('radius');
const freqControl = document.getElementById('frequency');
const pixelSizeControl = document.getElementById('pixelSize');

const effectButtons = Array.from(document.querySelectorAll('.effect'));
let currentEffect = 'none';

// LUT container for .cube file
let cubeLUT = null; // {size: N, data: Float32Array(length = N*N*N*3)}

async function loadCubeLUT(url){
  try{
    const txt = await fetch(url).then(r=>r.text());
    const lines = txt.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    let size = 0;
    const data = [];
    for(const line of lines){
      const parts = line.split(/\s+/);
      if(parts[0].toUpperCase() === 'LUT_3D_SIZE') {
        size = parseInt(parts[1],10);
        continue;
      }
      // ignore TITLE, DOMAIN_MIN/MAX etc.
      if(parts.length >= 3 && !isNaN(parseFloat(parts[0]))){
        data.push(parseFloat(parts[0]));
        data.push(parseFloat(parts[1]));
        data.push(parseFloat(parts[2]));
      }
    }
    if(size === 0){
      // try to infer size from data length
      const total = data.length / 3;
      size = Math.round(Math.pow(total, 1/3));
    }
    if(size > 0 && data.length === size*size*size*3){
      cubeLUT = { size, data: new Float32Array(data) };
      console.log('Loaded cube LUT', url, 'size', size);
    } else {
      console.warn('Invalid cube LUT or unexpected size', url, size, data.length);
    }
  }catch(err){
    console.error('Failed to load cube LUT', err);
  }
}

// load the provided cube LUT at start
loadCubeLUT('/The Original G-Major 2.cube');
// load the additional LUT for G-Major 5 (asset: original g major 5.cube)
let cubeLUT5 = null;
(async function loadGMajor5(){
  try{
    const txt = await fetch('/original g major 5.cube').then(r=>r.text());
    const lines = txt.split('\n').map(l=>l.trim()).filter(l=>l && !l.startsWith('#'));
    let size = 0;
    const data = [];
    for(const line of lines){
      const parts = line.split(/\s+/);
      if(parts[0].toUpperCase() === 'LUT_3D_SIZE') {
        size = parseInt(parts[1],10);
        continue;
      }
      if(parts.length >= 3 && !isNaN(parseFloat(parts[0]))){
        data.push(parseFloat(parts[0]));
        data.push(parseFloat(parts[1]));
        data.push(parseFloat(parts[2]));
      }
    }
    if(size === 0){
      const total = data.length / 3;
      size = Math.round(Math.pow(total, 1/3));
    }
    if(size > 0 && data.length === size*size*size*3){
      cubeLUT5 = { size, data: new Float32Array(data) };
      console.log('Loaded cube LUT for G-Major 5', '/original g major 5.cube', 'size', size);
    } else {
      console.warn('Invalid cube LUT or unexpected size for G-Major 5', size, data.length);
    }
  }catch(err){
    console.error('Failed to load cube LUT for G-Major 5', err);
  }
})();

// helper: sample nearest from cubeLUT given r,g,b 0..255
function applyCubeNearest(r,g,b){
  if(!cubeLUT) return [r,g,b];
  const N = cubeLUT.size;
  const inv = 1 / 255;
  const fr = Math.max(0, Math.min(1, r * inv));
  const fg = Math.max(0, Math.min(1, g * inv));
  const fb = Math.max(0, Math.min(1, b * inv));
  const ix = Math.min(N-1, Math.round(fr * (N-1)));
  const iy = Math.min(N-1, Math.round(fg * (N-1)));
  const iz = Math.min(N-1, Math.round(fb * (N-1)));
  const idx = (iz * N * N + iy * N + ix) * 3;
  const dr = cubeLUT.data[idx] * 255;
  const dg = cubeLUT.data[idx+1] * 255;
  const db = cubeLUT.data[idx+2] * 255;
  return [Math.round(dr), Math.round(dg), Math.round(db)];
}

// helper: sample nearest from cubeLUT5 (G-Major 5) given r,g,b 0..255
function applyCubeNearest5(r,g,b){
  if(!cubeLUT5) return [r,g,b];
  const N = cubeLUT5.size;
  const inv = 1 / 255;
  const fr = Math.max(0, Math.min(1, r * inv));
  const fg = Math.max(0, Math.min(1, g * inv));
  const fb = Math.max(0, Math.min(1, b * inv));
  const ix = Math.min(N-1, Math.round(fr * (N-1)));
  const iy = Math.min(N-1, Math.round(fg * (N-1)));
  const iz = Math.min(N-1, Math.round(fb * (N-1)));
  const idx = (iz * N * N + iy * N + ix) * 3;
  const dr = cubeLUT5.data[idx] * 255;
  const dg = cubeLUT5.data[idx+1] * 255;
  const db = cubeLUT5.data[idx+2] * 255;
  return [Math.round(dr), Math.round(dg), Math.round(db)];
}

effectButtons.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    effectButtons.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentEffect = btn.dataset.effect;
    renderOnce();
  });
});

// Search/filter for effects
const searchInput = document.getElementById('searchEffects');
if(searchInput){
  function filterEffects(){
    const q = (searchInput.value || '').trim().toLowerCase();
    effectButtons.forEach(btn=>{
      const label = (btn.textContent || btn.dataset.effect || '').toLowerCase();
      const matches = q === '' || label.indexOf(q) !== -1 || (btn.dataset.effect || '').toLowerCase().indexOf(q) !== -1;
      btn.style.display = matches ? '' : 'none';
      // subtle highlight for matched term
      if(matches && q !== ''){
        btn.innerHTML = btn.textContent.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'), m => `<span class="match">${m}</span>`);
      } else {
        // restore plain label (use dataset.effect fallback for safety)
        btn.innerHTML = btn.textContent;
      }
    });
  }
  searchInput.addEventListener('input', filterEffects);
  // allow Escape to clear quickly
  searchInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){ searchInput.value=''; filterEffects(); }
  });
}

// default select None
document.querySelector('.effect[data-effect="none"]').classList.add('active');

fileInput.addEventListener('change', async (e)=>{
  stopVideoLoop();
  const file = e.target.files?.[0];
  if(!file) return;
  const url = URL.createObjectURL(file);

  if(file.type.startsWith('video')){
    video.src = url;
    video.onloadedmetadata = () => {
      srcVideoLoaded = true;
      video.play();
      playing = true;
      playPause.classList.remove('hidden');
      startVideoLoop();
      fitCanvasToMedia(video.videoWidth, video.videoHeight);
    };
  } else {
    const img = new Image();
    img.onload = ()=> {
      srcImage = img;
      srcVideoLoaded = false;
      video.pause();
      playPause.classList.add('hidden');
      fitCanvasToMedia(img.width, img.height);
      renderOnce();
    };
    img.src = url;
  }
});

playPause.addEventListener('click', ()=>{
  if(!srcVideoLoaded) return;
  if(playing){ video.pause(); playing=false; stopVideoLoop(); }
  else { video.play(); playing=true; startVideoLoop(); }
});

scaleControl.addEventListener('input', renderOnce);
amountControl.addEventListener('input', renderOnce);
radiusControl.addEventListener('input', renderOnce);
freqControl.addEventListener('input', renderOnce);
pixelSizeControl.addEventListener('input', renderOnce);

function fitCanvasToMedia(w,h){
  // Compute CSS display size to fit into the preview area
  const outerMaxW = Math.min(window.innerWidth - 360, 1200) || 800;
  const outerMaxH = window.innerHeight - 200;
  // If sidebar stacked (mobile), allow almost full width
  const isNarrow = window.innerWidth <= 900;
  const maxW = isNarrow ? Math.floor(window.innerWidth - 24) : outerMaxW;
  const maxH = isNarrow ? Math.floor(window.innerHeight * 0.75) : outerMaxH;

  // compute scale to fit media inside available CSS pixels
  let ratio = Math.min(maxW / w, maxH / h, 1.6);
  const s = parseFloat(scaleControl.value) || 1;
  const cssW = Math.round(w * ratio * s);
  const cssH = Math.round(h * ratio * s);

  // Use devicePixelRatio for crisp rendering on high-DPI screens (mobile)
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  // Set canvas backing store to device pixels but keep CSS size to cssW x cssH
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  // scale drawing context so drawing APIs work in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  renderOnce();
}

function startVideoLoop(){
  cancelAnimationFrame(animationId);
  function loop(){
    if(video.readyState >= 2){
      fitCanvasToMedia(video.videoWidth, video.videoHeight);
      renderFrameFromVideo();
    }
    animationId = requestAnimationFrame(loop);
  }
  loop();
}

function stopVideoLoop(){
  cancelAnimationFrame(animationId);
}

function renderOnce(){
  if(srcVideoLoaded){
    // draw current video frame once
    renderFrameFromVideo();
  } else if(srcImage){
    drawSourceToBuffer(srcImage);
    applyEffectAndPresent();
  } else {
    // clear canvas
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }
}

function renderFrameFromVideo(){
  if(!srcVideoLoaded) return;
  drawSourceToBuffer(video);
  applyEffectAndPresent();
}

/* Draw source (image/video) scaled to canvas center preserving aspect */
function drawSourceToBuffer(media){
  // Use CSS/display pixels for layout math because the context is scaled by devicePixelRatio.
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const displayW = Math.round(canvas.width / dpr);
  const displayH = Math.round(canvas.height / dpr);

  // clear using display coords (context already transformed to CSS pixels)
  ctx.clearRect(0, 0, displayW, displayH);

  const mw = media.videoWidth || media.naturalWidth || media.width;
  const mh = media.videoHeight || media.naturalHeight || media.height;
  if(!mw || !mh) return;

  // fit 'contain' centered in the canvas (CSS pixels)
  const scale = Math.min(displayW / mw, displayH / mh);
  const w = Math.round(mw * scale);
  const h = Math.round(mh * scale);
  const x = Math.round((displayW - w) / 2);
  const y = Math.round((displayH - h) / 2);

  // drawImage uses the same CSS pixel coordinate space because ctx.setTransform was applied in fitCanvasToMedia/init
  ctx.drawImage(media, x, y, w, h);
}

/* EFFECTS: many implemented via pixel sampling and coordinate mapping */
function applyEffectAndPresent(){
  const effect = currentEffect;
  const amount = parseFloat(amountControl.value) || 0;
  const radius = parseFloat(radiusControl.value) || 0.5;
  const freq = parseFloat(freqControl.value) || 10;
  const pixelSize = Math.max(1,Math.round(pixelSizeControl.value) || 8);
  // time (seconds) for animated/time-based effects; for video use currentTime, otherwise use performance clock
  const time = (srcVideoLoaded && typeof video.currentTime === 'number') ? video.currentTime : (performance.now() / 1000);

  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0,0,w,h);
  const dst = ctx.createImageData(w,h);
  const sx = w/2, sy = h/2;
  const maxr = Math.min(w,h) * radius;

  // helpers
  function sampleNearest(x,y){
    const ix = Math.max(0, Math.min(w-1, Math.round(x)));
    const iy = Math.max(0, Math.min(h-1, Math.round(y)));
    const idx = (iy * w + ix) * 4;
    return [src.data[idx], src.data[idx+1], src.data[idx+2], src.data[idx+3]];
  }
  function setPixel(i, r,g,b,a){ dst.data[i]=r;dst.data[i+1]=g;dst.data[i+2]=b;dst.data[i+3]=a; }

  // pixelate handled early
  if(effect === 'pixelate'){
    // block sampling
    for(let by=0; by<h; by+=pixelSize){
      for(let bx=0; bx<w; bx+=pixelSize){
        // average block color
        let r=0,g=0,b=0,c=0;
        for(let yy=by; yy<Math.min(h,by+pixelSize); yy++){
          for(let xx=bx; xx<Math.min(w,bx+pixelSize); xx++){
            const idx=(yy*w+xx)*4;
            r+=src.data[idx]; g+=src.data[idx+1]; b+=src.data[idx+2]; c++;
          }
        }
        r=Math.round(r/c); g=Math.round(g/c); b=Math.round(b/c);
        for(let yy=by; yy<Math.min(h,by+pixelSize); yy++){
          for(let xx=bx; xx<Math.min(w,bx+pixelSize); xx++){
            const idx=(yy*w+xx)*4;
            setPixel(idx, r,g,b,255);
          }
        }
      }
    }
    ctx.putImageData(dst,0,0);
    return;
  }

  // iterate every pixel and map coordinates for distortion effects
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i = (y*w + x) * 4;
      let nx=x, ny=y;

      const dx = x - sx;
      const dy = y - sy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      switch(effect){
        case 'none':
          // copy direct
          dst.data[i]=src.data[i]; dst.data[i+1]=src.data[i+1]; dst.data[i+2]=src.data[i+2]; dst.data[i+3]=src.data[i+3];
          continue;

        case 'pinch': {
          if(dist < maxr){
            const a = Math.abs(amount);
            const k = 1 - a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          break;
        }

        case 'bulge': {
          if(dist < maxr){
            const a = Math.abs(amount);
            const k = 1 + a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          break;
        }

        case 'i-defeated-x': {
          // I Defeated X: Pinch displacement + hue shift (-120°) applied in post-process
          if(dist < maxr){
            const a = Math.abs(amount);
            // use pinch (pull toward center) rather than bulge
            const k = 1 - a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          break;
        }

        case 'blind-x': {
          // Blind X:
          // - Bulge (centered at an offset from image center)
          // - Mirror Left mapping (mirror right half into left half)
          // We'll interpret the requested offsets as an offset applied to the bulge center:
          //   offsetX: -151 pixels from center X, offsetY: -111 pixels from center Y
          // bulge strength uses 'amount' and radius uses maxr
          const offsetX = -151;
          const offsetY = -111;
          const cx = sx + offsetX;
          const cy = sy + offsetY;
          const dxB = x - cx;
          const dyB = y - cy;
          const distB = Math.sqrt(dxB*dxB + dyB*dyB);
          if(distB < maxr){
            const a = Math.abs(amount);
            // bulge (expand outward)
            const k = 1 + a * (1 - (distB / maxr));
            const r = distB * k;
            const theta = Math.atan2(dyB, dxB);
            nx = cx + r * Math.cos(theta);
            ny = cy + r * Math.sin(theta);
          }
          // Mirror Left mapping: mirror right half into left half
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'blind-major': {
          // Blind Major:
          // - Pinch (centered at offset from image center)
          // - Mirror Left mapping (mirror right half into left half)
          // Pinch center offset: offsetX: -151, offsetY: -111 (same offsets requested)
          // center offsets are now normalized fractions of canvas size (e.g. -0.219, -0.051)
          const offsetXM = -0.219;
          const offsetYM = -0.051;
          // convert normalized offsets to pixel offsets relative to canvas center
          const cxM = sx + offsetXM * w;
          const cyM = sy + offsetYM * h;
          const dxM = x - cxM;
          const dyM = y - cyM;
          const distM = Math.sqrt(dxM*dxM + dyM*dyM);
          if(distM < maxr){
            const a = Math.abs(amount);
            // pinch: pull toward center
            const k = 1 - a * (1 - (distM / maxr));
            const r = distM * k;
            const theta = Math.atan2(dyM, dxM);
            nx = cxM + r * Math.cos(theta);
            ny = cyM + r * Math.sin(theta);
          }
          // Mirror Left mapping: mirror right half into left half
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'angry-x': {
          // Angry X:
          // - Bulge centered at image center using amount/radius
          // - Mirror Left mapping: mirror right half into left half
          // Color chain applied later: Invert -> RGB->BGR -> Hue +60°
          if(dist < maxr){
            const a = Math.abs(amount);
            // bulge (expand outward)
            const k = 1 + a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          // Mirror Left mapping: mirror right half into left half
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'happy-x': {
          // Happy X:
          // - Apply vertical wave twice (double vertical-wave) as coordinate displacement
          // - Then apply G-Major 1 color chain later (invert + 180° hue rotation)
          // We'll do two successive vertical wave offsets based on amount/freq.
          const amp = amount * 20;
          // first vertical wave
          ny = y + Math.sin((x / w) * freq * Math.PI * 2) * amp;
          // second vertical wave — apply again using the intermediate ny value (wave applied twice)
          ny = ny + Math.sin((x / w) * freq * Math.PI * 2) * amp;
          break;
        }

        case 'g-major-74': {
          // G-Major 74: Pinch warp (G-Major 1 + Pinch) — color chain applied in post-process
          if(dist < maxr){
            const a = Math.abs(amount);
            // pinch effect (opposite of bulge): closer to center pulls inward
            const k = 1 - a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          break;
        }

        case 'g-major-677': {
          // G-Major 677: bulge centered at image center, horizontal wave, then mirror-left (right -> left)
          // 1) bulge-like displacement around center
          if(dist < maxr){
            const a = Math.abs(amount);
            const k = 1 + a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          // 2) horizontal wave component applied to the displaced coordinates
          const ampNS = amount * 10;
          nx = nx + Math.sin(( (ny) / h) * freq * Math.PI * 2) * ampNS;

          // 3) mirror-left mapping (mirror right half into left half)
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'hwave': {
          const amp = amount * 20;
          nx = x + Math.sin((y / h) * freq * Math.PI * 2) * amp;
          break;
        }

        case 'vwave': {
          const amp = amount * 20;
          ny = y + Math.sin((x / w) * freq * Math.PI * 2) * amp;
          break;
        }

        case 'bothwaves': {
          const amp = amount * 20;
          nx = x + Math.sin((y / h) * freq * Math.PI * 2) * amp;
          ny = y + Math.sin((x / w) * freq * Math.PI * 2) * amp;
          break;
        }

        case 'ripple': {
          // radial ripple displacement based on distance and time
          if(maxr > 0){
            // normalized distance 0..1 within ripple radius
            if(dist < maxr){
              const norm = dist / maxr;
              // ripple wave; amount controls strength, freq controls waves per radius, time animates
              const wave = Math.sin((norm * freq * Math.PI * 2) - (time * freq)) * amount * 20;
              // displace along radial direction
              if(dist !== 0){
                nx = x + (dx / dist) * wave;
                ny = y + (dy / dist) * wave;
              } else {
                nx = x + wave;
                ny = y;
              }
            }
          }
          break;
        }

        case 'confusion': {
          // Mirror Left coordinate mapping: mirror the right half into left half
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'even-x-discontinues': {
          // Even X Discontinues: apply Luig Group (hue later) + Swirl(+1.7) + Horizontal Wave + Swirl(-1.7)
          // We'll compose coordinate transforms before sampling.
          // Start with local coordinates relative to center
          let tx = x, ty = y;
          const cx = sx, cy = sy;
          const dx1 = tx - cx, dy1 = ty - cy;
          const dist1 = Math.sqrt(dx1*dx1 + dy1*dy1);
          if(dist1 < maxr){
            // first swirl (positive)
            const t1 = (1 - dist1 / maxr);
            const angle1 = 1.7 * t1 * amount; // scaled by amount
            const theta1 = Math.atan2(dy1, dx1) + angle1;
            tx = cx + dist1 * Math.cos(theta1);
            ty = cy + dist1 * Math.sin(theta1);
          }
          // horizontal wave on intermediate coords
          const amp = amount * 20;
          tx = tx + Math.sin((ty / h) * freq * Math.PI * 2) * amp;
          // second swirl (negative)
          const dx2 = tx - cx, dy2 = ty - cy;
          const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
          if(dist2 < maxr){
            const t2 = (1 - dist2 / maxr);
            const angle2 = -1.7 * t2 * amount;
            const theta2 = Math.atan2(dy2, dx2) + angle2;
            nx = cx + dist2 * Math.cos(theta2);
            ny = cy + dist2 * Math.sin(theta2);
          } else {
            nx = tx;
            ny = ty;
          }
          break;
        }

        case 'flip': {
          nx = w - x - 1;
          break;
        }

        case 'mirror-left': {
          if(x > w/2) nx = w - x - 1;
          break;
        }
        case 'low-voice': {
          // Low Voice: mirror-left coordinate mapping (mirror right half into left half)
          if(x > w/2) nx = w - x - 1;
          break;
        }
        case 'slow-voice': {
          // Slow Voice: Mirror Right coordinate mapping (mirror left half into right half)
          if(x < w/2) nx = w - x - 1;
          break;
        }
        case 'g-major-14': {
          // G-Major 14: Mirror Left + Mirror Top coordinate mapping (mirror right->left and bottom->top)
          if(x > w/2) nx = w - x - 1;
          if(y > h/2) ny = h - y - 1;
          break;
        }
        case 'g-major-4-confusion': {
          // G-Major 4's CoNfUsIoN coordinate mapping:
          // Mirror Left mapping (mirror right half into left half) — follows CoNfUsIoN spatial mapping
          if(x > w/2) nx = w - x - 1;
          break;
        }

        case 'g-major-16': {
          // G-Major 16: Flip horizontally (handled in coord mapping) — color chain: Invert + Hue -120 applied in post-process
          nx = w - x - 1;
          break;
        }
        case 'g-major-17': {
          // G-Major 17: I Defeated X coordinate mapping (pinch displacement) + Mirror Left mapping
          // reuse I Defeated X pinch logic but then mirror-left
          if(dist < maxr){
            const a = Math.abs(amount);
            // pinch (pull toward center) rather than bulge
            const k = 1 - a * (1 - (dist / maxr));
            const r = dist * k;
            const theta = Math.atan2(dy,dx);
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          // Mirror Left mapping: mirror right half into left half
          if(x > w/2) nx = w - x - 1;
          break;
        }
        case 'g-major-19': {
          // G-Major 19: Mirror Left coordinate mapping (mirror right half into left half)
          if(x > w/2) nx = w - x - 1;
          break;
        }
        case 'g-major-10': {
          // G-Major 10 uses same coordinate mapping as G-Major 19 (mirror left)
          if(x > w/2) nx = w - x - 1;
          break;
        }
        case 'g-major-11': {
          // G-Major 11: Mirror Right coordinate mapping (mirror left half into right half)
          if(x < w/2) nx = w - x - 1;
          break;
        }

        case 'u-major': {
          // U-Major: Flip horizontally (mirror) and add a horizontal wave displacement.
          // Apply flip first, then add a horizontal sinusoidal wave across Y to create the wavy flip.
          nx = w - x - 1;
          const ampU = amount * 20;
          nx = nx + Math.sin((y / h) * freq * Math.PI * 2) * ampU;
          break;
        }

        case 'g-major-3': {
          // G-Major 3: Horizontal Wave coordinate mapping (wave across Y) - uses amount & frequency
          const ampH = amount * 20;
          nx = x + Math.sin((y / h) * freq * Math.PI * 2) * ampH;
          break;
        }
        case 'mirror-right': {
          if(x < w/2) nx = w - x - 1;
          break;
        }
        case 'not-scary': {
          // Not Scary: Horizontal Wave displacement + Mirror Right mapping
          // Apply horizontal wave first, then mirror-right mapping so the wave pattern is mirrored into the right half.
          const ampNS = amount * 20;
          nx = x + Math.sin((y / h) * freq * Math.PI * 2) * ampNS;
          // mirror-right: mirror left half into right half
          if(x < w/2) nx = w - nx - 1;
          break;
        }
        case 'blind-and-deaf': {
          // Combined Blind X + Deaf:
          // 1) Blind X style bulge centered at an offset (offsetX:-151, offsetY:-111) + mirror-left behavior
          // 2) Deaf style pinch centered near (0.796,0.477)
          // Apply bulge first, then pinch, then apply both mirror heuristics for a blended effect.
          const offsetX = -151;
          const offsetY = -111;
          const cxB = sx + offsetX;
          const cyB = sy + offsetY;
          const dxB = x - cxB;
          const dyB = y - cyB;
          const distB = Math.sqrt(dxB*dxB + dyB*dyB);
          if(distB < maxr){
            const a = Math.abs(amount);
            // bulge (expand outward) from blind-x
            const k = 1 + a * (1 - (distB / maxr));
            const rB = distB * k;
            const thetaB = Math.atan2(dyB, dxB);
            nx = cxB + rB * Math.cos(thetaB);
            ny = cyB + rB * Math.sin(thetaB);
          } else {
            nx = x; ny = y;
          }

          // Then apply Deaf pinch around its normalized center onto the displaced coords
          const centerNX = 0.796;
          const centerNY = 0.477;
          const cxD = sx + (centerNX - 0.5) * w;
          const cyD = sy + (centerNY - 0.5) * h;
          const dxD = nx - cxD;
          const dyD = ny - cyD;
          const distD = Math.sqrt(dxD*dxD + dyD*dyD);
          if(distD < maxr){
            const a2 = Math.abs(amount);
            const k2 = 1 - a2 * (1 - (distD / maxr));
            const rD = distD * k2;
            const thetaD = Math.atan2(dyD, dxD);
            nx = cxD + rD * Math.cos(thetaD);
            ny = cyD + rD * Math.sin(thetaD);
          }

          // Apply mirror-left mapping: mirror right half into left half
          if (x > w/2) nx = w - x - 1;
          break;
        }

        case 'conga-busher': {
          // Conga Busher: Mirror Right mapping (mirror left half into right half)
          if (x < w/2) nx = w - x - 1;
          break;
        }
        case 'deaf': {
          // Deaf: Pinch centered near (0.796,0.477) (normalized), then Mirror Right mapping.
          // Apply pinch displacement around specified center using 'amount' and 'radius'
          // interpret center as normalized coordinates (0..1)
          const centerNX = 0.796;
          const centerNY = 0.477;
          // convert normalized center to pixel coordinates relative to canvas center (sx, sy)
          const cx = sx + (centerNX - 0.5) * w;
          const cy = sy + (centerNY - 0.5) * h;
          const dxD = x - cx;
          const dyD = y - cy;
          const distD = Math.sqrt(dxD*dxD + dyD*dyD);
          if(distD < maxr){
            const a = Math.abs(amount);
            // pinch (pull toward center)
            const k = 1 - a * (1 - (distD / maxr));
            const rD = distD * k;
            const thetaD = Math.atan2(dyD, dxD);
            nx = cx + rD * Math.cos(thetaD);
            ny = cy + rD * Math.sin(thetaD);
          } else {
            nx = x; ny = y;
          }
          // Mirror Right mapping: mirror left half into right half (so right shows mirrored left)
          if(x < w/2) nx = w - x - 1;
          break;
        }
        case 'v-major': {
          // V-Major: Mirror Right coordinate mapping (mirror left half into right half)
          // color chain applied later (Invert + 180° hue rotation)
          if(x < w/2) nx = w - x - 1;
          break;
        }
        case 'mirror-top': {
          if(y > h/2) ny = h - y - 1;
          break;
        }
        case 'mirror-bottom': {
          if(y < h/2) ny = h - y - 1;
          break;
        }

        case 'swirl':
        case 'rswirl':
        case 'does-respond':
        case 'does-not-respond': {
          // swirl variants and "does-not-respond" (same swirl coords; color treatment applied later)
          // 'rswirl' and 'does-respond' use reversed sign, 'swirl' and 'does-not-respond' use positive sign
          const sign = (effect === 'rswirl' || effect === 'does-respond') ? -1 : 1;
          if(dist < maxr){
            const t = (1 - dist / maxr);
            const angle = sign * amount * t * 3.5;
            const theta = Math.atan2(dy,dx) + angle;
            const r = dist;
            nx = sx + r * Math.cos(theta);
            ny = sy + r * Math.sin(theta);
          }
          break;
        }

        case 'invert': {
          // color invert after sample -> set special flag
          break;
        }

        case 'invert-hue': {
          // hue rotation later
          break;
        }

        case 'deform': {
          // simple shear-like deformation using sin + amount
          nx = x + Math.sin((y / h) * freq * Math.PI * 2) * amount * 40;
          ny = y + Math.sin((x / w) * freq * Math.PI * 2) * amount * 20;
          break;
        }

        case 'crying': {
          // Crying: apply a vertical wave displacement (wave along X moving pixels vertically)
          // color invert + hue shift are applied later in the color post-processing section
          ny = y + Math.sin((x / w) * freq * Math.PI * 2 + time * freq) * amount * 20;
          break;
        }

        case 'grayscale': {
          // sample then desaturate
          break;
        }

        default:
          break;
      }

      // sample with optional radial blur when Sponge is active
      let sampled;
      if(effect === 'sponge'){
        // radial blur: average samples along the radial line from center to current sample point
        const samples = 6; // keep low for performance
        let ar=0, ag=0, ab=0;
        // compute radial vector from center toward the sampling point (nx,ny)
        const vx = nx - sx;
        const vy = ny - sy;
        for(let s=0;s<samples;s++){
          const t = s / (samples - 1 || 1);
          const sxp = sx + vx * t;
          const syp = sy + vy * t;
          const sp = sampleNearest(sxp, syp);
          ar += sp[0]; ag += sp[1]; ab += sp[2];
        }
        sampled = [Math.round(ar / samples), Math.round(ag / samples), Math.round(ab / samples), 255];
      } else {
        sampled = sampleNearest(nx, ny);
      }
      let [r,g,b,a] = sampled;

      // post-process color-only effects
      if(effect === 'invert'){
        r = 255 - r; g = 255 - g; b = 255 - b;
      } else if(effect === 'invert-hue'){
        // quick hue rotate by converting to HSL and shifting hue by 180 degrees
        const moved = hueRotatePixel(r,g,b,180);
        r = moved[0]; g = moved[1]; b = moved[2];
      } else if(effect === 'not-scary'){
        // Not Scary color chain: hue rotate 180° (same as invert-hue)
        const movedNS = hueRotatePixel(r,g,b,180);
        r = movedNS[0]; g = movedNS[1]; b = movedNS[2];
      } else if(effect === 'low-voice'){
        // Low Voice color chain: invert-hue (180°) applied after mirror-left coordinate mapping
        const movedLV = hueRotatePixel(r,g,b,180);
        r = movedLV[0]; g = movedLV[1]; b = movedLV[2];
      } else if(effect === 'slow-voice'){
        // Slow Voice color chain: after Mirror Right mapping, rotate hue +120°
        const movedSV = hueRotatePixel(r,g,b,120);
        r = movedSV[0]; g = movedSV[1]; b = movedSV[2];
      } else if(effect === 'luig-group'){
        // Luig Group applies a hue rotation of -50 degrees
        const moved = hueRotatePixel(r,g,b,-50);
        r = moved[0]; g = moved[1]; b = moved[2];
      } else if(effect === 'mari-group'){
        // Mari Group applies a hue rotation of +50 degrees
        const movedM = hueRotatePixel(r,g,b,50);
        r = movedM[0]; g = movedM[1]; b = movedM[2];
      } else if(effect === 'does-respond'){
        // Does Respond = Reversed Swirl (handled in coordinate mapping) + Luig Group hue rotation
        const movedDR = hueRotatePixel(r,g,b,-50);
        r = movedDR[0]; g = movedDR[1]; b = movedDR[2];
      } else if(effect === 'does-not-respond'){
        // Does Not Respond = Swirl (handled in coordinate mapping) + Mari Group hue rotation (+50°)
        const movedDNR = hueRotatePixel(r,g,b,50);
        r = movedDNR[0]; g = movedDNR[1]; b = movedDNR[2];
      } else if(effect === 'hue-cycle'){
        // rainbow hue cycle: base rotation over time plus spatial hue offset across the image
        // amount controls speed (deg/sec); horizontal position adds a static hue gradient to create a rainbow
        const baseDeg = (amount * 360 * time) % 360;
        // spatial offset across X (0..360). You can also combine Y for diagonal bands if desired.
        const spatialDeg = (x / w) * 360;
        const deg = (baseDeg + spatialDeg) % 360;
        const moved = hueRotatePixel(r, g, b, deg);
        r = moved[0]; g = moved[1]; b = moved[2];
      } else if(effect === 'chorded'){
        // Map luminance to gradient: White -> Blue -> Cyan (low->high maps directly)
        const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
        const gradient = [
          [0.0, [255,255,255]], // low -> white
          [0.5, [48, 120, 255]], // mid -> blue
          [1.0, [0, 200, 200]]  // high -> cyan-ish
        ];
        // Use luminance directly so mapping follows White -> Blue -> Cyan
        const mapped = mapGradient(lum, gradient);
        r = mapped[0]; g = mapped[1]; b = mapped[2];
      } else if(effect === 'chorded-2014'){
        // Chorded (August 2014): Gradient Map White -> Cyan -> Black
        const lum2014 = (0.299*r + 0.587*g + 0.114*b) / 255;
        const chord2014 = [
          [0.0, [255,255,255]], // white at darkest
          [0.5, [0,255,255]],   // cyan at mid
          [1.0, [0,0,0]]        // black at brightest
        ];
        const mapped2014 = mapGradient(lum2014, chord2014);
        r = mapped2014[0]; g = mapped2014[1]; b = mapped2014[2];
      } else if(effect === 'chorded-2014-july'){
        // Chorded (July 2014): Gradient Map White -> Cyan -> Green
        const lum2014j = (0.299*r + 0.587*g + 0.114*b) / 255;
        const chord2014j = [
          [0.0, [255,255,255]], // white at darkest
          [0.5, [0,255,255]],   // cyan at mid
          [1.0, [0,255,0]]      // green at brightest
        ];
        const mapped2014j = mapGradient(lum2014j, chord2014j);
        r = mapped2014j[0]; g = mapped2014j[1]; b = mapped2014j[2];
      } else if(effect === 'rainbow-map'){
        // Map luminance to a full rainbow gradient left(0) -> right(1)
        const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
        const rainbow = [
          [0.0, [148,0,211]],   // violet
          [0.17, [75,0,130]],   // indigo
          [0.33, [0,0,255]],    // blue
          [0.5, [0,255,255]],   // cyan
          [0.67, [0,255,0]],    // green
          [0.83, [255,255,0]],  // yellow
          [1.0, [255,0,0]]      // red
        ];
        const mapped = mapGradient(lum, rainbow);
        r = mapped[0]; g = mapped[1]; b = mapped[2];
      } else if(effect === 'group'){
        // Group: Gradient Map Black -> Cyan -> Blue -> Black based on luminance
        const lumG = (0.299*r + 0.587*g + 0.114*b) / 255;
        const groupGrad = [
          [0.0, [0,0,0]],       // black at darkest
          [0.33, [0,255,255]],  // cyan at low-mid
          [0.66, [48,120,255]], // blue at mid-high
          [1.0, [0,0,0]]        // black at brightest
        ];
        const mappedG = mapGradient(lumG, groupGrad);
        r = mappedG[0]; g = mappedG[1]; b = mappedG[2];
      } else if(effect === 'autovocoding'){
        // Autovocoding: Gradient Map Blue -> Green -> Black -> White
        // Map pixel luminance to custom gradient stops
        const lumA = (0.299*r + 0.587*g + 0.114*b) / 255;
        const autoGrad = [
          [0.0, [0, 32, 255]],   // deep blue for darkest
          [0.33, [0, 200, 120]], // greenish at low-mid
          [0.66, [0, 0, 0]],     // black in mid-high
          [1.0, [255,255,255]]   // white at brightest
        ];
        const mappedA = mapGradient(lumA, autoGrad);
        r = mappedA[0]; g = mappedA[1]; b = mappedA[2];
      } else if(effect === 'helium'){
        // Helium: Gradient Map Green -> Cyan -> Blue
        const lumH = (0.299*r + 0.587*g + 0.114*b) / 255;
        const heliumGrad = [
          [0.0, [0, 160, 80]],   // green
          [0.5, [0, 200, 200]],  // cyan
          [1.0, [48, 120, 255]]  // blue
        ];
        const mappedH = mapGradient(lumH, heliumGrad);
        r = mappedH[0]; g = mappedH[1]; b = mappedH[2];
      } else if(effect === 'power'){
        // Power: Gradient Map Pink -> Blue -> Cyan
        const lumP = (0.299*r + 0.587*g + 0.114*b) / 255;
        const powerGrad = [
          [0.0, [255, 100, 180]], // pink
          [0.5, [48, 120, 255]],  // blue
          [1.0, [0, 255, 230]]    // cyan-ish
        ];
        const mappedP = mapGradient(lumP, powerGrad);
        r = mappedP[0]; g = mappedP[1]; b = mappedP[2];
      } else if(effect === 'sponge'){
        // Sponge: radial blur + Gradient Map Orange -> Yellow -> Azure -> Cyan, map by luminance
        const lumS = (0.299*r + 0.587*g + 0.114*b) / 255;
        const spongeGrad = [
          [0.0, [255, 120, 0]],   // orange
          [0.33, [255, 220, 0]],  // yellow
          [0.66, [0, 200, 255]],  // azure
          [1.0, [0, 255, 255]]    // cyan
        ];
        const mappedS = mapGradient(lumS, spongeGrad);
        r = mappedS[0]; g = mappedS[1]; b = mappedS[2];
      } else if(effect === 'g-major-14'){
        // G-Major 14: Gradient Map Blue -> Black (applied after Mirror Left + Mirror Top coordinate mapping)
        const lum14 = (0.299*r + 0.587*g + 0.114*b) / 255;
        const gm14Grad = [
          [0.0, [48, 120, 255]], // blue
          [1.0, [0, 0, 0]]      // black
        ];
        const mapped14 = mapGradient(lum14, gm14Grad);
        r = mapped14[0]; g = mapped14[1]; b = mapped14[2];
      } else if(effect === 'g-major-1'){
        // G-Major 1: Invert + Invert Hue (invert colors then hue rotate 180°)
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedGM1 = hueRotatePixel(r, g, b, 180);
        r = movedGM1[0]; g = movedGM1[1]; b = movedGM1[2];
      } else if(effect === 'v-major'){
        // V-Major: Mirror Right coordinate mapping applied earlier, now apply G-Major 1 color chain:
        // Invert then hue rotate 180°
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedV = hueRotatePixel(r, g, b, 180);
        r = movedV[0]; g = movedV[1]; b = movedV[2];
      } else if(effect === 'g-major-18'){
        // G-Major 18: Saturation effect — scale saturation by (1 + amount)
        // convert rgb -> hsl, scale s, convert back
        (function(){
          // normalize
          let R=r/255, G=g/255, B=b/255;
          const max = Math.max(R,G,B), min = Math.min(R,G,B);
          let h=0, s=0, l=(max+min)/2;
          if(max !== min){
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
              case R: h = (G - B) / d + (G < B ? 6 : 0); break;
              case G: h = (B - R) / d + 2; break;
              case B: h = (R - G) / d + 4; break;
            }
            h /= 6;
          }
          // scale saturation by factor, clamp
          const factor = 1 + (parseFloat(amountControl.value) || 0);
          s = Math.max(0, Math.min(1, s * factor));
          // hsl -> rgb
          function hue2rgb(p,q,t){ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p + (q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p + (q-p)*(2/3 - t)*6; return p; }
          let rr, gg, bb;
          if(s === 0){ rr = gg = bb = l; }
          else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l*s;
            const p = 2 * l - q;
            rr = hue2rgb(p, q, h + 1/3);
            gg = hue2rgb(p, q, h);
            bb = hue2rgb(p, q, h - 1/3);
          }
          r = Math.round(rr * 255); g = Math.round(gg * 255); b = Math.round(bb * 255);
        })();
      } else if(effect === 'pika-major'){
        // Pika Major: hue rotate +26 degrees, then scale saturation by (1 + amount)
        // 1) hue rotate +26
        {
          const moved = hueRotatePixel(r,g,b,26);
          r = moved[0]; g = moved[1]; b = moved[2];
        }
        // 2) increase saturation by factor (1 + amount) using same routine as G-Major 18
        (function(){
          let R=r/255, G=g/255, B=b/255;
          const max = Math.max(R,G,B), min = Math.min(R,G,B);
          let h=0, s=0, l=(max+min)/2;
          if(max !== min){
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
              case R: h = (G - B) / d + (G < B ? 6 : 0); break;
              case G: h = (B - R) / d + 2; break;
              case B: h = (R - G) / d + 4; break;
            }
            h /= 6;
          }
          const factor = 1 + (parseFloat(amountControl.value) || 0);
          s = Math.max(0, Math.min(1, s * factor));
          function hue2rgb(p,q,t){ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p + (q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p + (q-p)*(2/3 - t)*6; return p; }
          let rr, gg, bb;
          if(s === 0){ rr = gg = bb = l; }
          else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l*s;
            const p = 2 * l - q;
            rr = hue2rgb(p, q, h + 1/3);
            gg = hue2rgb(p, q, h);
            bb = hue2rgb(p, q, h - 1/3);
          }
          r = Math.round(rr * 255); g = Math.round(gg * 255); b = Math.round(bb * 255);
        })();
      } else if(effect === 'g-major-16'){
        // G-Major 16 color chain: Flip already done in coords; now Invert then Hue -120°
        r = 255 - r; g = 255 - g; b = 255 - b;
        const moved16 = hueRotatePixel(r,g,b,-120);
        r = moved16[0]; g = moved16[1]; b = moved16[2];
      } else if(effect === 'g-major-17'){
        // G-Major 17 color chain: I Defeated X color chain — Hue -120° (applied after pinch+mirror coords)
        const moved17 = hueRotatePixel(r,g,b,-120);
        r = moved17[0]; g = moved17[1]; b = moved17[2];
      } else if(effect === 'g-major-19'){
        // G-Major 19 color chain: RGB->BGR then hue rotate by 180°
        // swap R and B
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // hue rotate 180 degrees
        const movedG = hueRotatePixel(r,g,b,180);
        r = movedG[0]; g = movedG[1]; b = movedG[2];
      } else if(effect === 'g-major-10'){
        // G-Major 10: first convert RGB -> BGR, then invert colors, then hue rotate 180°
        // swap R and B
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // invert colors
        r = 255 - r; g = 255 - g; b = 255 - b;
        // hue rotate 180 degrees
        const moved1 = hueRotatePixel(r,g,b,180);
        r = moved1[0]; g = moved1[1]; b = moved1[2];
      } else if(effect === 'g-major-11'){
        // G-Major 11: after Mirror Right coordinate mapping, apply Invert then Grayscale
        // invert colors
        r = 255 - r; g = 255 - g; b = 255 - b;
        // convert to grayscale (lum)
        const v11 = Math.round((r*0.299 + g*0.587 + b*0.114));
        r = g = b = v11;
      } else if(effect === 'g-major-13'){
        // G-Major 13: RGB->BGR (swap R and B) then apply G-Major 4 tonal mapping
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // G-Major 4 tonal mapping: darker tones keep original, lighter tones fade toward black
        (function(){
          const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
          const threshold = 0.5;
          if(lum > threshold){
            const t = (lum - threshold) / (1 - threshold);
            r = Math.round(r * (1 - t));
            g = Math.round(g * (1 - t));
            b = Math.round(b * (1 - t));
          }
        })();
      } else if(effect === 'g-major-12'){
        // G-Major 12: Luig Group (-50° hue) -> G-Major 4 tonal mapping -> increase saturation by (1 + amount)
        // 1) Luig Group hue rotate -50
        {
          const movedL = hueRotatePixel(r,g,b,-50);
          r = movedL[0]; g = movedL[1]; b = movedL[2];
        }
        // 2) G-Major 4 tonal mapping (fade lighter tones to black)
        (function(){
          const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
          const threshold = 0.5;
          if(lum > threshold){
            const t = (lum - threshold) / (1 - threshold);
            r = Math.round(r * (1 - t));
            g = Math.round(g * (1 - t));
            b = Math.round(b * (1 - t));
          }
        })();
        // 3) increase saturation by factor (1 + amount)
        (function(){
          let R=r/255, G=g/255, B=b/255;
          const max = Math.max(R,G,B), min = Math.min(R,G,B);
          let h=0, s=0, l=(max+min)/2;
          if(max !== min){
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max){
              case R: h = (G - B) / d + (G < B ? 6 : 0); break;
              case G: h = (B - R) / d + 2; break;
              case B: h = (R - G) / d + 4; break;
            }
            h /= 6;
          }
          const factor = 1 + (parseFloat(amountControl.value) || 0);
          s = Math.max(0, Math.min(1, s * factor));
          function hue2rgb(p,q,t){ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p + (q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p + (q-p)*(2/3 - t)*6; return p; }
          let rr, gg, bb;
          if(s === 0){ rr = gg = bb = l; }
          else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l*s;
            const p = 2 * l - q;
            rr = hue2rgb(p, q, h + 1/3);
            gg = hue2rgb(p, q, h);
            bb = hue2rgb(p, q, h - 1/3);
          }
          r = Math.round(rr * 255); g = Math.round(gg * 255); b = Math.round(bb * 255);
        })();
      } else if(effect === 'g-major-2'){
        // G-Major 2: apply LUT from The Original G-Major 2.cube (nearest sampling)
        const mapped = applyCubeNearest(r,g,b);
        r = mapped[0]; g = mapped[1]; b = mapped[2];
      } else if(effect === 'g-major-3'){
        // G-Major 3: Red filter — boost red channel, reduce green/blue for a warm red tint
        // Keep values clamped 0..255
        r = Math.round(Math.min(255, r * 1.15 + 10));
        g = Math.round(Math.max(0, g * 0.45));
        b = Math.round(Math.max(0, b * 0.45));
      } else if(effect === 'g-major-5'){
        // G-Major 5: apply LUT from original g major 5.cube (nearest sampling)
        const mapped5 = applyCubeNearest5(r,g,b);
        r = mapped5[0]; g = mapped5[1]; b = mapped5[2];
      } else if(effect === 'g-major-54'){
        // G-Major 54: Gradient Map White -> Red -> Black based on luminance
        const lum54 = (0.299*r + 0.587*g + 0.114*b) / 255;
        const gm54Grad = [
          [0.0, [255,255,255]], // white at darkest
          [0.5, [255,0,0]],     // red at mid
          [1.0, [0,0,0]]        // black at brightest
        ];
        const mapped54 = mapGradient(lum54, gm54Grad);
        r = mapped54[0]; g = mapped54[1]; b = mapped54[2];
      } else if(effect === 'g-major-74'){
        // G-Major 74 = Bulge displacement (done in coord mapping) + G-Major 1 color chain
        // apply invert then 180° hue rotation
        r = 255 - r; g = 255 - g; b = 255 - b;
        const moved74 = hueRotatePixel(r,g,b,180);
        r = moved74[0]; g = moved74[1]; b = moved74[2];
      } else if(effect === 'g-major-677'){
        // G-Major 677 color chain: RGB->BGR then Hue +60°
        // 1) swap R and B channels (RGB -> BGR)
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // 2) hue rotate +60 degrees
        const moved677 = hueRotatePixel(r, g, b, 60);
        r = moved677[0]; g = moved677[1]; b = moved677[2];
      } else if(effect === 'g-major-6'){
        // G-Major 6: Threshold at 60% luminance — binarize to black or white
        const lum6 = (0.299*r + 0.587*g + 0.114*b) / 255;
        const thresh = 0.60;
        if(lum6 >= thresh){
          // bright -> white
          r = 255; g = 255; b = 255;
        } else {
          // dark -> black
          r = 0; g = 0; b = 0;
        }
      } else if(effect === 'g-major-8'){
        // G-Major 8 = G-Major 6 (threshold @60%) followed by G-Major 1 color chain (invert + hue rotate 180°)
        const lum8 = (0.299*r + 0.587*g + 0.114*b) / 255;
        const thresh8 = 0.60;
        if(lum8 >= thresh8){
          // bright -> white
          r = 255; g = 255; b = 255;
        } else {
          // dark -> black
          r = 0; g = 0; b = 0;
        }
        // Then apply G-Major 1: invert then hue-rotate 180°
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedGM8 = hueRotatePixel(r, g, b, 180);
        r = movedGM8[0]; g = movedGM8[1]; b = movedGM8[2];
      } else if(effect === 'i-defeated-x'){
        // I Defeated X color chain: after bulge displacement, rotate hue -120 degrees
        const movedIDX = hueRotatePixel(r,g,b,-120);
        r = movedIDX[0]; g = movedIDX[1]; b = movedIDX[2];
      } else if(effect === 'blind-x'){
        // Blind X color chain: Invert colors then hue rotate -50 degrees
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedBX = hueRotatePixel(r,g,b,-50);
        r = movedBX[0]; g = movedBX[1]; b = movedBX[2];
      } else if(effect === 'blind-major'){
        // Blind Major color chain: Invert colors then hue rotate +50 degrees
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedBM = hueRotatePixel(r, g, b, 50);
        r = movedBM[0]; g = movedBM[1]; b = movedBM[2];
      } else if(effect === 'angry-x'){
        // Angry X color chain: Invert -> RGB->BGR -> Hue +60°
        // 1) invert colors
        r = 255 - r; g = 255 - g; b = 255 - b;
        // 2) RGB -> BGR swap
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // 3) hue rotate +60 degrees
        const movedAX = hueRotatePixel(r, g, b, 60);
        r = movedAX[0]; g = movedAX[1]; b = movedAX[2];
      } else if(effect === 'happy-x'){
        // Happy X color chain: G-Major 1 => Invert then hue rotate 180°
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedH = hueRotatePixel(r, g, b, 180);
        r = movedH[0]; g = movedH[1]; b = movedH[2];
      } else if(effect === 'g-major-4'){
        // G-Major 4: keep original colors in darker tones, and progressively fade lighter tones to black
        const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
        const threshold = 0.5; // luminance below this keeps original color
        if(lum <= threshold){
          // keep original r,g,b and alpha unchanged
        } else {
          // blend original color toward black based on how bright the pixel is
          const t = (lum - threshold) / (1 - threshold); // 0..1
          r = Math.round(r * (1 - t));
          g = Math.round(g * (1 - t));
          b = Math.round(b * (1 - t));
          // keep alpha unchanged
        }
      } else if(effect === 'g-major-4-confusion'){
        // G-Major 4's CoNfUsIoN color chain:
        // Start with CoNfUsIoN's color chain: Invert -> Hue rotate 180°
        r = 255 - r; g = 255 - g; b = 255 - b;
        let movedC = hueRotatePixel(r,g,b,180);
        r = movedC[0]; g = movedC[1]; b = movedC[2];
        // then apply G-Major 4 tonal mapping (fade lighter tones toward black)
        (function(){
          const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
          const threshold = 0.5;
          if(lum <= threshold){
            // keep as-is
          } else {
            const t = (lum - threshold) / (1 - threshold);
            r = Math.round(r * (1 - t));
            g = Math.round(g * (1 - t));
            b = Math.round(b * (1 - t));
          }
        })();
      } else if(effect === 'green-lowers'){
        // Green Lowers: swap R and B (RGB->BGR) then hue rotate -120 degrees
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        const movedGL = hueRotatePixel(r,g,b,-120);
        r = movedGL[0]; g = movedGL[1]; b = movedGL[2];
      } else if(effect === 'confusion'){
        // CoNfUsIoN = Mirror Left (handled in coordinate mapping) + Invert colors + Hue rotate by 180°
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedC = hueRotatePixel(r,g,b,180);
        r = movedC[0]; g = movedC[1]; b = movedC[2];
      } else if(effect === 'u-major'){
        // U-Major color chain: after flipping & wave displacement (coordinate mapping), swap R and B (RGB->BGR)
        // Then invert colors to add the requested "Invert" step for U-Major.
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // Invert colors (RGB -> 255 - RGB)
        r = 255 - r;
        g = 255 - g;
        b = 255 - b;
      } else if(effect === 'even-x-discontinues'){
        // Luig Group color treatment: hue rotation of -50 degrees
        const movedE = hueRotatePixel(r,g,b,-50);
        r = movedE[0]; g = movedE[1]; b = movedE[2];
      } else if(effect === 'grayscale'){
        const v = Math.round((r*0.299 + g*0.587 + b*0.114));
        r=g=b=v;
      } else if(effect === 'rgb2bgr'){
        // swap R and B channels
        const tmp = r;
        r = b;
        b = tmp;
      } else if(effect === 'crying'){
        // Crying = Invert colors, Vertical Wave displacement (handled below in mapping) + hue shift -120
        // invert first then hue-rotate
        r = 255 - r; g = 255 - g; b = 255 - b;
        const movedCry = hueRotatePixel(r,g,b,-120);
        r = movedCry[0]; g = movedCry[1]; b = movedCry[2];
      } else if(effect === 'blind-and-deaf'){
        // Blind + Deaf combined color chain:
        // apply Blind X color chain (Invert -> Hue -50°), then Deaf color chain (Invert -> RGB->BGR -> Hue -150°)
        // (double inverts may cancel, but we preserve the requested sequence)
        // 1) Blind X: invert then hue -50
        r = 255 - r; g = 255 - g; b = 255 - b;
        let movedB = hueRotatePixel(r,g,b,-50);
        r = movedB[0]; g = movedB[1]; b = movedB[2];
        // 2) Deaf: invert, swap R/B, hue -150
        r = 255 - r; g = 255 - g; b = 255 - b;
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        const movedD = hueRotatePixel(r,g,b,-150);
        r = movedD[0]; g = movedD[1]; b = movedD[2];
      } else if(effect === 'conga-busher'){
        // Conga Busher color chain: Hue rotate -120°
        const movedCB = hueRotatePixel(r,g,b,-120);
        r = movedCB[0]; g = movedCB[1]; b = movedCB[2];
      } else if(effect === 'deaf'){
        // Deaf color chain: Invert -> RGB->BGR -> Hue -150°
        // 1) invert
        r = 255 - r; g = 255 - g; b = 255 - b;
        // 2) RGB -> BGR (swap R and B)
        {
          const tmp = r;
          r = b;
          b = tmp;
        }
        // 3) hue rotate -150 degrees
        const movedDeaf = hueRotatePixel(r,g,b,-150);
        r = movedDeaf[0]; g = movedDeaf[1]; b = movedDeaf[2];
      }

      setPixel(i, r,g,b,a);
    }
  }

  ctx.putImageData(dst,0,0);

  // draw timer overlay for Sponge effect in bottom-right corner
  if(currentEffect === 'sponge'){
    // use video time if video, otherwise a performance-based time
    const t = (srcVideoLoaded && typeof video.currentTime === 'number') ? video.currentTime : (performance.now() / 1000);
    const secs = Math.max(0, t).toFixed(2);
    const padding = 8;
    const fontSize = 14; // CSS pixels
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    const text = `${secs}s`;
    const metrics = ctx.measureText(text);
    // compute CSS pixel positions because ctx was scaled to CSS pixels earlier
    const cssW = canvas.width / Math.max(1, window.devicePixelRatio || 1);
    const cssH = canvas.height / Math.max(1, window.devicePixelRatio || 1);
    const tx = cssW - metrics.width - padding;
    const ty = cssH - padding;
    // draw semi-transparent rounded background
    const bw = metrics.width + padding * 2;
    const bh = fontSize + padding;
    const bx = tx - padding;
    const by = ty - fontSize - padding / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    const rrect = 6;
    ctx.beginPath();
    ctx.moveTo(bx + rrect, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, rrect);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, rrect);
    ctx.arcTo(bx, by + bh, bx, by, rrect);
    ctx.arcTo(bx, by, bx + bw, by, rrect);
    ctx.closePath();
    ctx.fill();
    // text
    ctx.fillStyle = '#fff';
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }
}

/* Utility: simple RGB -> HSL -> rotate -> RGB */
function hueRotatePixel(r,g,b,deg){
  // convert to [0,1]
  let R=r/255, G=g/255, B=b/255;
  const max = Math.max(R,G,B), min = Math.min(R,G,B);
  let h=0,s=0,l=(max+min)/2;
  if(max!==min){
    const d=max-min;
    s = l>0.5? d/(2-max-min) : d/(max+min);
    switch(max){
      case R: h = (G-B)/d + (G<B?6:0); break;
      case G: h = (B-R)/d + 2; break;
      case B: h = (R-G)/d + 4; break;
    }
    h /= 6;
  }
  // rotate
  h = (h + deg/360) % 1;
  if(h<0) h+=1;
  // HSL -> RGB
  function hue2rgb(p,q,t){
    if(t<0) t+=1;
    if(t>1) t-=1;
    if(t<1/6) return p + (q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p + (q-p)*(2/3 - t)*6;
    return p;
  }
  let rr,gg,bb;
  if(s===0){ rr=gg=bb=l; }
  else {
    const q = l < 0.5 ? l*(1+s) : l + s - l*s;
    const p = 2*l - q;
    rr = hue2rgb(p,q,h+1/3);
    gg = hue2rgb(p,q,h);
    bb = hue2rgb(p,q,h-1/3);
  }
  return [Math.round(rr*255), Math.round(gg*255), Math.round(bb*255)];
}

/* Gradient mapping helpers: interpolate colors and map luminance to a gradient */
function lerp(a,b,t){ return Math.round(a + (b-a)*t); }
// lerpColor now supports RGB or RGBA color arrays
function lerpColor(c1, c2, t){
  const len = Math.max(c1.length, c2.length);
  const out = [];
  for(let i=0;i<len;i++){
    const v1 = (typeof c1[i] === 'number') ? c1[i] : (i === 3 ? 255 : 0);
    const v2 = (typeof c2[i] === 'number') ? c2[i] : (i === 3 ? 255 : 0);
    out.push(lerp(v1, v2, t));
  }
  return out;
}
// gradientStops: array of [position(0..1), [r,g,b] or [r,g,b,a]]
function mapGradient(luminance, gradientStops){
  // clamp
  const v = Math.max(0, Math.min(1, luminance));
  // find segment
  for(let i=0;i<gradientStops.length-1;i++){
    const a = gradientStops[i], b = gradientStops[i+1];
    if(v >= a[0] && v <= b[0]){
      const t = (v - a[0]) / (b[0] - a[0] || 1);
      return lerpColor(a[1], b[1], t);
    }
  }
  // fallback to last color
  return gradientStops[gradientStops.length-1][1];
}

/* DOWNLOAD image */
document.getElementById('downloadImage').addEventListener('click', ()=>{
  const a = document.createElement('a');
  a.download = 'edited.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
});

/* EXPORT VIDEO: capture n frames of current video with effect and assemble using WebM via MediaRecorder */
document.getElementById('exportVideo').addEventListener('click', async ()=>{
  // If there's a video loaded, export its frames; otherwise export a short animation of the image (3s)
  const durationSeconds = srcVideoLoaded ? (video.duration || 3) : 3;
  const fps = 25;
  const totalFrames = Math.round(durationSeconds * fps);

  // Create offscreen canvas stream
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
  const chunks = [];
  rec.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  rec.start();

  // play video from start if video source; otherwise use image
  if(srcVideoLoaded){
    video.pause();
    video.currentTime = 0;
    await video.play().catch(()=>{});
  }

  // render frames at fixed fps
  for(let f=0; f<totalFrames; f++){
    if(srcVideoLoaded){
      // advance time to precise frame
      const t = Math.min(video.duration, f / fps);
      video.currentTime = t;
      // wait for frame to be ready
      await waitForNextFrame();
      drawSourceToBuffer(video);
      applyEffectAndPresent();
    } else if(srcImage){
      drawSourceToBuffer(srcImage);
      // optional small animated parameter for interest
      amountControl.value = (Math.sin(f / 6) * 0.5).toString();
      applyEffectAndPresent();
    }
    // wait to satisfy capture framerate (rough)
    await new Promise(res => setTimeout(res, 1000 / fps));
  }

  rec.stop();
  // ensure recorder finished
  await new Promise(resolve=> rec.onstop = resolve);
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'edited.webm'; a.click();
  URL.revokeObjectURL(url);
  if(srcVideoLoaded){
    video.pause();
  }
});

function waitForNextFrame(){
  return new Promise(resolve=>{
    requestAnimationFrame(()=>setTimeout(resolve,0));
  });
}

/* Initialize canvas blank with device pixel ratio awareness */
(function initCanvasPlaceholder(){
  const cssW = 800, cssH = 500;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#111'; ctx.fillRect(0,0,cssW,cssH);
  ctx.fillStyle = '#99aab8'; ctx.font = '18px sans-serif';
  ctx.fillText('Load an image or video to begin', 20, 40);
})();