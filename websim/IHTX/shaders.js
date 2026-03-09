/*
  Simple shader-like helpers implemented with CSS, small canvases and transforms.
  Exports:
    - EFFECT_NAMES: array of supported effect names (for UI)
    - getFilter(effect): returns a CSS filter string (or "none")
    - applyPreviewEffect(effect, videoEl, containerEl): applies extra DOM overlays/animations for preview
    - clearPreviewEffect(containerEl): removes overlays/animation added by applyPreviewEffect
*/

export const EFFECT_NAMES = [
  "None",
  "Grayscale",
  "Sepia",
  "Invert",
  "Brightness+",
  "Contrast+",
  "Blur",
  "Saturate+",
  "Wave",
  "Shake",
  "HueRotate",
  "Pinch&Bulge",
  "FilmGrain",
  "Stretch",
];

export function getFilter(effect) {
  switch (effect) {
    case "Grayscale": return "grayscale(1)";
    case "Sepia": return "sepia(1)";
    case "Invert": return "invert(1)";
    case "Brightness+": return "brightness(1.25)";
    case "Contrast+": return "contrast(1.25)";
    case "Blur": return "blur(3px)";
    case "Saturate+": return "saturate(1.5)";
    case "HueRotate": return "hue-rotate(90deg)";
    case "Stretch": return "none"; // handled via transform
    case "Wave": return "none"; // handled via overlay transform
    case "Shake": return "none"; // handled via animation
    case "Pinch&Bulge": return "none"; // handled via SVG filter overlay if available (fallback none)
    case "FilmGrain": return "none"; // handled via overlay canvas
    default: return "none";
  }
}

function ensureOverlayContainer(container) {
  if (!container) return null;
  let ov = container.querySelector(".shader-overlays");
  if (!ov) {
    ov = document.createElement("div");
    ov.className = "shader-overlays";
    Object.assign(ov.style, {
      position: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      pointerEvents: "none",
      overflow: "hidden",
      mixBlendMode: "normal"
    });
    container.style.position = container.style.position || "relative";
    container.appendChild(ov);
  }
  return ov;
}

export function applyPreviewEffect(effect, videoEl, containerEl) {
  if (!videoEl || !containerEl) return;
  clearPreviewEffect(containerEl);
  const ov = ensureOverlayContainer(containerEl);
  // Basic transform-based effects
  if (effect === "Stretch") {
    videoEl.style.transformOrigin = "50% 50%";
    videoEl.style.transition = "transform 200ms ease";
    videoEl.style.transform = "scaleX(1.35) scaleY(0.9)";
    return;
  }
  if (effect === "Wave") {
    // Use a CSS-based wave animation: inject keyframes once and add a class to the video element.
    if (!document.getElementById("shader-wave-styles")) {
      const style = document.createElement("style");
      style.id = "shader-wave-styles";
      style.innerHTML = `
        @keyframes shader-wave-translate {
          0% { transform: translateY(0px) skewX(0deg); }
          25% { transform: translateY(-3px) skewX(-1.2deg); }
          50% { transform: translateY(2px) skewX(0.8deg); }
          75% { transform: translateY(-1px) skewX(-0.6deg); }
          100% { transform: translateY(0px) skewX(0deg); }
        }
        .shader-wave-anim {
          animation: shader-wave-translate 900ms cubic-bezier(.2,.8,.2,1) infinite;
          will-change: transform;
        }
      `;
      document.head.appendChild(style);
    }
    // add a subtle overlay element so mix/blend or vignette could be applied later
    const wrap = document.createElement("div");
    wrap.className = "wave-wrap";
    Object.assign(wrap.style, {
      position: "absolute", left: 0, top: 0, right: 0, bottom: 0,
      pointerEvents: "none"
    });
    ov.appendChild(wrap);
    // apply class to the video element
    videoEl.classList.add("shader-wave-anim");
    wrap.dataset.added = "1";
    return;
  }
  if (effect === "Shake") {
    videoEl.style.transition = "none";
    const wrap = document.createElement("div");
    wrap.className = "shake-wrap";
    Object.assign(wrap.style, { position: "absolute", left:0,top:0,right:0,bottom:0, pointerEvents:"none" });
    let raf = null;
    function frame() {
      const rx = (Math.random() - 0.5) * 8;
      const ry = (Math.random() - 0.5) * 6;
      videoEl.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(frame);
      wrap.dataset.raf = raf;
    }
    ov.appendChild(wrap);
    raf = requestAnimationFrame(frame);
    wrap.dataset.raf = raf;
    return;
  }
  if (effect === "FilmGrain") {
    // overlay a small canvas with noise
    const c = document.createElement("canvas");
    c.width = 320; c.height = 180;
    Object.assign(c.style, { width: "100%", height: "100%", display: "block", opacity: 0.06 });
    const ctx = c.getContext("2d");
    let raf = null;
    function drawNoise() {
      const w = c.width, h = c.height;
      const id = ctx.createImageData(w, h);
      for (let i=0;i<id.data.length;i+=4) {
        const v = (Math.random() * 255)|0;
        id.data[i] = v;
        id.data[i+1] = v;
        id.data[i+2] = v;
        id.data[i+3] = 20; // low alpha
      }
      ctx.putImageData(id,0,0);
      raf = requestAnimationFrame(drawNoise);
      c.dataset.raf = raf;
    }
    ov.appendChild(c);
    raf = requestAnimationFrame(drawNoise);
    c.dataset.raf = raf;
    return;
  }
  if (effect === "Pinch&Bulge") {
    // fallback: subtle scale + radial blur-ish vignette via overlay
    videoEl.style.transform = "scale(1.06)";
    const v = document.createElement("div");
    Object.assign(v.style, {
      position:"absolute",left:0,top:0,right:0,bottom:0,
      background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.18) 100%)",
      pointerEvents: "none"
    });
    ov.appendChild(v);
    return;
  }
  // default: nothing extra
}

export function clearPreviewEffect(containerEl) {
  if (!containerEl) return;
  const ov = containerEl.querySelector(".shader-overlays");
  if (ov) {
    // cancel any RAFs stored on children
    const nodes = Array.from(ov.querySelectorAll("*"));
    nodes.forEach(n => {
      const raf = n.dataset && n.dataset.raf;
      if (raf) try { cancelAnimationFrame(Number(raf)); } catch(e){}
    });
    ov.remove();
  }
  // Also remove any animation classes and reset transforms on video elements inside the container
  const videos = Array.from(containerEl.querySelectorAll("video, .preview-inner video"));
  videos.forEach(v => {
    try {
      v.classList.remove("shader-wave-anim");
      v.style.transform = "";
      v.style.transition = "";
    } catch (e) {}
  });
}