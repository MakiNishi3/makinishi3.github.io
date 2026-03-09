import { jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useState, useEffect } from "react";
function VideoEditor() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const rafRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [activePreset, setActivePreset] = useState("None");
  const [selectedEffect, setSelectedEffect] = useState("None");
  const EFFECTS = Array.from(
    new Set(
      Object.values(PRESETS).flat().flatMap((p) => typeof p === "string" && p.includes("+") ? p.split("+").map((s) => s.trim()) : [p]).filter(Boolean)
    )
  ).sort();
  if (!EFFECTS.includes("None")) EFFECTS.unshift("None");
  const swapRGB = (data, mode) => {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (mode === "BGR") {
        data[i] = b;
        data[i + 1] = g;
        data[i + 2] = r;
      } else if (mode === "GRB") {
        data[i] = g;
        data[i + 1] = r;
        data[i + 2] = b;
      }
    }
  };
  const hueShift = (data, shift) => {
    const deg2rad = Math.PI / 180;
    const s = Math.sin(shift * deg2rad), c = Math.cos(shift * deg2rad);
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const nr = (0.213 + c * 0.787 - s * 0.213) * r + (0.715 - c * 0.715 - s * 0.715) * g + (0.072 - c * 0.072 + s * 0.928) * b;
      const ng = (0.213 - c * 0.213 + s * 0.143) * r + (0.715 + c * 0.285 + s * 0.14) * g + (0.072 - c * 0.072 - s * 0.283) * b;
      const nb = (0.213 - c * 0.213 - s * 0.787) * r + (0.715 - c * 0.715 + s * 0.715) * g + (0.072 + c * 0.928 + s * 0.072) * b;
      data[i] = Math.min(255, Math.max(0, nr * 255));
      data[i + 1] = Math.min(255, Math.max(0, ng * 255));
      data[i + 2] = Math.min(255, Math.max(0, nb * 255));
    }
  };
  const flipHorizontal = (ctx, canvasW, canvasH) => {
    const tmp = document.createElement("canvas");
    tmp.width = canvasW;
    tmp.height = canvasH;
    const tctx = tmp.getContext("2d");
    tctx.translate(canvasW, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(tmp, 0, 0);
  };
  const bulge = (ctx, canvasW, canvasH, strength = 0.5) => {
    const src = ctx.getImageData(0, 0, canvasW, canvasH);
    const dst = ctx.createImageData(canvasW, canvasH);
    const cx = canvasW / 2, cy = canvasH / 2;
    const maxR = Math.min(cx, cy);
    for (let y = 0; y < canvasH; y++) {
      for (let x = 0; x < canvasW; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const nd = r / maxR;
        const factor = 1 + strength * (1 - Math.pow(nd, 2));
        const sx = Math.round(cx + dx * factor);
        const sy = Math.round(cy + dy * factor);
        const di = (y * canvasW + x) * 4;
        if (sx >= 0 && sx < canvasW && sy >= 0 && sy < canvasH) {
          const si = (sy * canvasW + sx) * 4;
          dst.data[di] = src.data[si];
          dst.data[di + 1] = src.data[si + 1];
          dst.data[di + 2] = src.data[si + 2];
          dst.data[di + 3] = src.data[si + 3];
        } else {
          dst.data[di] = dst.data[di + 1] = dst.data[di + 2] = 0;
          dst.data[di + 3] = 255;
        }
      }
    }
    ctx.putImageData(dst, 0, 0);
  };
  const PRESETS = {
    "None": [],
    "J Major 1 (NewBlueFX)": ["Waves", "G Major", "RGB To BGR", "Flip"],
    "A Major -1": ["Crying", "Chorded", "J Major", "G Major 4"],
    "G Major -2.1": ["G Major 17", "Chorded", "The Real G Major 4"],
    "G & C Major": ["Bulge", "G Major 1", "G Major 4", "RGB To GRB"],
    "G Major 4.2": ["My G Major", "Bulge", "Hue:-190"]
  };
  const applyWaves = (ctx, w, h, frame = 0) => {
    const src = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    const amp = Math.max(3, Math.round(h * 0.02));
    const freq = 0.02;
    for (let y = 0; y < h; y++) {
      const shift = Math.round(Math.sin(y * freq + frame * 0.1) * amp);
      for (let x = 0; x < w; x++) {
        const sx = x + shift;
        const di = (y * w + x) * 4;
        if (sx >= 0 && sx < w) {
          const si = (y * w + sx) * 4;
          dst.data[di] = src.data[si];
          dst.data[di + 1] = src.data[si + 1];
          dst.data[di + 2] = src.data[si + 2];
          dst.data[di + 3] = src.data[si + 3];
        } else {
          dst.data[di] = dst.data[di + 1] = dst.data[di + 2] = 0;
          dst.data[di + 3] = 255;
        }
      }
    }
    ctx.putImageData(dst, 0, 0);
  };
  const applyCrying = (ctx, w, h) => {
    const src = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    const k = 5;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let r = 0, g = 0, b = 0, a = 0, cnt = 0;
        for (let ky = -k; ky <= k; ky++) {
          const sy = Math.min(h - 1, Math.max(0, y + ky));
          const si = (sy * w + x) * 4;
          r += src.data[si];
          g += src.data[si + 1];
          b += src.data[si + 2];
          a += src.data[si + 3];
          cnt++;
        }
        const di = (y * w + x) * 4;
        dst.data[di] = r / cnt;
        dst.data[di + 1] = g / cnt;
        dst.data[di + 2] = b / cnt;
        dst.data[di + 3] = a / cnt;
      }
    }
    ctx.putImageData(dst, 0, 0);
  };
  const applyContrastTint = (ctx, w, h, tint = [1, 1, 1], contrast = 1) => {
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      let r = img.data[i] / 255, g = img.data[i + 1] / 255, b = img.data[i + 2] / 255;
      r = ((r - 0.5) * contrast + 0.5) * tint[0];
      g = ((g - 0.5) * contrast + 0.5) * tint[1];
      b = ((b - 0.5) * contrast + 0.5) * tint[2];
      img.data[i] = Math.min(255, Math.max(0, r * 255));
      img.data[i + 1] = Math.min(255, Math.max(0, g * 255));
      img.data[i + 2] = Math.min(255, Math.max(0, b * 255));
    }
    ctx.putImageData(img, 0, 0);
  };
  const runPipeline = (ctx, w, h, effects, frame = 0) => {
    for (const e of effects) {
      if (e === "RGB To BGR") {
        const img = ctx.getImageData(0, 0, w, h);
        swapRGB(img.data, "BGR");
        ctx.putImageData(img, 0, 0);
      } else if (e === "RGB To GRB") {
        const img = ctx.getImageData(0, 0, w, h);
        swapRGB(img.data, "GRB");
        ctx.putImageData(img, 0, 0);
      } else if (e === "Flip") {
        flipHorizontal(ctx, w, h);
      } else if (e === "Bulge" || e === "bulge") {
        bulge(ctx, w, h, 0.45);
      } else if (e.startsWith("Hue:")) {
        const val = parseFloat(e.split(":")[1]) || 0;
        const img = ctx.getImageData(0, 0, w, h);
        hueShift(img.data, val);
        ctx.putImageData(img, 0, 0);
      } else if (e === "Waves") {
        applyWaves(ctx, w, h, frame);
      } else if (e === "Crying") {
        applyCrying(ctx, w, h);
      } else if (e === "Chorded") {
        applyContrastTint(ctx, w, h, [1.1, 0.95, 0.95], 1.12);
      } else if (e === "G Major" || e === "G Major 1") {
        applyContrastTint(ctx, w, h, [0.9, 1.05, 0.95], 1.08);
      } else if (e === "G Major 4") {
        applyContrastTint(ctx, w, h, [0.95, 1.08, 1.02], 1.15);
      } else if (e === "G Major 17") {
        applyContrastTint(ctx, w, h, [0.9, 1.12, 0.95], 1.2);
      } else if (e === "My G Major" || e === "The Real G Major 4") {
        applyContrastTint(ctx, w, h, [0.92, 1.06, 0.96], 1.18);
      } else if (e === "J Major") {
        applyContrastTint(ctx, w, h, [1.02, 0.98, 1.05], 1.05);
      } else if (e === "Waves + G Major + RGB To BGR + Flip") {
        runPipeline(ctx, w, h, ["Waves", "G Major", "RGB To BGR", "Flip"], frame);
      }
    }
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setFileName(f.name);
    const v = videoRef.current;
    v.src = url;
    v.load();
    v.onloadedmetadata = () => {
      setDuration(v.duration || 0);
      setStart(0);
      setEnd(v.duration || 0);
    };
  };
  let previewFrame = 0;
  const drawToCanvas = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d");
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 360;
    const loop = () => {
      if (!v.paused && !v.ended) {
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const pipelineSource = selectedEffect && selectedEffect !== "None" ? [selectedEffect] : PRESETS[activePreset] || [];
        const flattened = pipelineSource.flatMap((p) => typeof p === "string" && p.includes("+") ? p.split("+").map((s) => s.trim()) : p);
        runPipeline(ctx, c.width, c.height, flattened, previewFrame);
        previewFrame++;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(rafRef.current || 0);
    rafRef.current = requestAnimationFrame(loop);
  };
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current || 0);
      const v = videoRef.current;
      if (v && v.src && v.src.startsWith("blob:")) URL.revokeObjectURL(v.src);
    };
  }, []);
  const playTrim = async () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(start, Math.max(0, start));
    await v.play();
    setPlaying(true);
    drawToCanvas();
    const onTime = () => {
      if (v.currentTime >= end - 0.03) {
        v.pause();
        setPlaying(false);
        v.removeEventListener("timeupdate", onTime);
        cancelAnimationFrame(rafRef.current || 0);
      }
    };
    v.addEventListener("timeupdate", onTime);
  };
  const pause = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
    cancelAnimationFrame(rafRef.current || 0);
  };
  const exportTrim = async () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    setExporting(true);
    chunksRef.current = [];
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 360;
    const ctx = c.getContext("2d");
    const stream = c.captureStream(30);
    const options = { mimeType: "video/webm; codecs=vp9" };
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
      mediaRecorder = new MediaRecorder(stream);
    }
    recorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setOutputs((prev) => [{ url, name: buildOutputName(), blob }, ...prev]);
      setExporting(false);
    };
    v.muted = true;
    v.currentTime = start;
    let frame = 0;
    const drawLoop = () => {
      if (v.paused || v.ended) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const pipelineSource = selectedEffect && selectedEffect !== "None" ? [selectedEffect] : PRESETS[activePreset] || [];
      const flattened = pipelineSource.flatMap((p) => typeof p === "string" && p.includes("+") ? p.split("+").map((s) => s.trim()) : p);
      runPipeline(ctx, c.width, c.height, flattened, frame);
      frame++;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(6, 6, 140, 30);
      ctx.fillStyle = "#e6eef6";
      ctx.font = "14px sans-serif";
      ctx.fillText(formatTime(v.currentTime) + " / " + formatTime(end), 12, 28);
      if (v.currentTime >= end - 0.03) {
        v.pause();
        recorderRef.current.stop();
        cancelAnimationFrame(rafRef.current || 0);
        return;
      }
      rafRef.current = requestAnimationFrame(drawLoop);
    };
    mediaRecorder.start();
    await v.play();
    rafRef.current = requestAnimationFrame(drawLoop);
  };
  const buildOutputName = () => {
    const base = (fileName || "clip").replace(/\.[^/.]+$/, "");
    const s = Math.max(0, start).toFixed(2);
    const e = Math.max(0, end).toFixed(2);
    const presetName = activePreset && activePreset !== "None" ? `_${activePreset.replace(/\s+/g, "_")}` : "";
    return `${base}_trim_${s}-${e}${presetName}.webm`;
  };
  const downloadOutput = (o) => {
    const a = document.createElement("a");
    a.href = o.url;
    a.download = o.name;
    a.click();
  };
  const removeOutput = (idx) => {
    setOutputs((prev) => {
      const next = prev.slice();
      const [removed] = next.splice(idx, 1);
      if (removed && removed.url) URL.revokeObjectURL(removed.url);
      return next;
    });
  };
  const formatTime = (t = 0) => {
    const sec = Math.floor(t);
    const mm = Math.floor(sec / 60).toString().padStart(2, "0");
    const ss = (sec % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  };
  return /* @__PURE__ */ jsxDEV("div", { className: "grid", style: { marginTop: 8 }, children: [
    /* @__PURE__ */ jsxDEV("div", { className: "videoCard", children: [
      /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, children: [
        /* @__PURE__ */ jsxDEV("input", { id: "file", type: "file", accept: "video/*", onChange: onFile }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 417,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("label", { className: "btn fileBtn", htmlFor: "file", children: "Choose Video" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 418,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", onClick: () => {
          if (videoRef.current) {
            videoRef.current.play();
            drawToCanvas();
            setPlaying(true);
          }
        }, disabled: !fileName, children: "Play" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 419,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn", onClick: pause, disabled: !fileName, children: "Pause" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 420,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { className: "btn primary", onClick: exportTrim, disabled: !fileName || exporting, children: "Export Trim" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 421,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { style: { marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }, children: [
          /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" }, children: [
            /* @__PURE__ */ jsxDEV("div", { className: "small", children: "Preset:" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 425,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("select", { value: activePreset, onChange: (e) => setActivePreset(e.target.value), style: { padding: 6, borderRadius: 6, background: "#07101a", color: "#e6eef6", border: "1px solid rgba(255,255,255,0.04)" }, children: Object.keys(PRESETS).map((k) => /* @__PURE__ */ jsxDEV("option", { value: k, children: k }, k, false, {
              fileName: "<stdin>",
              lineNumber: 427,
              columnNumber: 49
            }, this)) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 426,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 424,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" }, children: [
            /* @__PURE__ */ jsxDEV("div", { className: "small", children: "Effect:" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 432,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("select", { value: selectedEffect, onChange: (e) => setSelectedEffect(e.target.value), style: { padding: 6, borderRadius: 6, background: "#07101a", color: "#e6eef6", border: "1px solid rgba(255,255,255,0.04)" }, children: EFFECTS.map((ef) => /* @__PURE__ */ jsxDEV("option", { value: ef, children: ef }, ef, false, {
              fileName: "<stdin>",
              lineNumber: 434,
              columnNumber: 37
            }, this)) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 433,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 431,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 423,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 416,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", marginTop: 8 }, children: /* @__PURE__ */ jsxDEV("video", { ref: videoRef, controls: true, style: { width: "100%", height: "auto" } }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 441,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 440,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", marginTop: 8 }, children: /* @__PURE__ */ jsxDEV("canvas", { ref: canvasRef, className: "previewCanvas" }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 445,
        columnNumber: 11
      }, this) }, void 0, false, {
        fileName: "<stdin>",
        lineNumber: 444,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { style: { width: "100%", marginTop: 8 }, children: [
        /* @__PURE__ */ jsxDEV("div", { className: "row", style: { justifyContent: "space-between" }, children: [
          /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
            "Start: ",
            formatTime(start)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 450,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
            "End: ",
            formatTime(end),
            " ",
            duration ? `of ${formatTime(duration)}` : ""
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 451,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 449,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV(
          "input",
          {
            className: "range",
            type: "range",
            min: 0,
            max: duration || 0,
            step: 0.01,
            value: start,
            onChange: (e) => {
              const v = Math.min(parseFloat(e.target.value), end - 0.05);
              setStart(v);
              if (videoRef.current) videoRef.current.currentTime = v;
            },
            disabled: !fileName
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 454,
            columnNumber: 11
          },
          this
        ),
        /* @__PURE__ */ jsxDEV(
          "input",
          {
            className: "range",
            type: "range",
            min: 0,
            max: duration || 0,
            step: 0.01,
            value: end,
            onChange: (e) => {
              const v = Math.max(parseFloat(e.target.value), start + 0.05);
              setEnd(v);
            },
            disabled: !fileName
          },
          void 0,
          false,
          {
            fileName: "<stdin>",
            lineNumber: 468,
            columnNumber: 11
          },
          this
        )
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 448,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 415,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("div", { className: "side", children: [
      /* @__PURE__ */ jsxDEV("div", { style: { background: "linear-gradient(180deg,#06131a,#041019)", padding: 12, borderRadius: 10 }, children: [
        /* @__PURE__ */ jsxDEV("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Export Queue" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 486,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", style: { marginBottom: 8 }, children: "Exports appear here when finished. You can download or remove them." }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 487,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "outputList", children: [
          outputs.length === 0 && /* @__PURE__ */ jsxDEV("div", { className: "small", children: "No exports yet" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 489,
            columnNumber: 38
          }, this),
          outputs.map((o, i) => /* @__PURE__ */ jsxDEV("div", { className: "fileItem", children: [
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", flexDirection: "column" }, children: [
              /* @__PURE__ */ jsxDEV("div", { style: { fontSize: 13 }, children: o.name }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 493,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
                (o.blob.size / 1024 / 1024).toFixed(2),
                " MB"
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 494,
                columnNumber: 19
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 492,
              columnNumber: 17
            }, this),
            /* @__PURE__ */ jsxDEV("div", { style: { display: "flex", gap: 8 }, children: [
              /* @__PURE__ */ jsxDEV("button", { className: "btn", onClick: () => downloadOutput(o), children: "Download" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 497,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("button", { className: "btn", onClick: () => removeOutput(i), children: "Remove" }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 498,
                columnNumber: 19
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 496,
              columnNumber: 17
            }, this)
          ] }, i, true, {
            fileName: "<stdin>",
            lineNumber: 491,
            columnNumber: 15
          }, this))
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 488,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 485,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { style: { background: "linear-gradient(180deg,#06131a,#041019)", padding: 12, borderRadius: 10 }, children: [
        /* @__PURE__ */ jsxDEV("div", { style: { fontWeight: 700, marginBottom: 6 }, children: "Status" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 506,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "File: ",
          fileName || "\u2014"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 507,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "Duration: ",
          duration ? formatTime(duration) : "\u2014"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 508,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "Trim: ",
          formatTime(start),
          " \u2192 ",
          formatTime(end)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 509,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { style: { height: 8 } }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 510,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "Playing: ",
          playing ? "yes" : "no"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 511,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "Exporting: ",
          exporting ? "in progress" : "idle"
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 512,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { style: { height: 8 } }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 513,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "small", children: [
          "Active Preset: ",
          activePreset
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 514,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 505,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 484,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 414,
    columnNumber: 5
  }, this);
}
export {
  VideoEditor as default
};
