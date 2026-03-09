import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import React, { useRef, useState, useEffect } from "react";
import Timeline from "./timeline.jsx";
import { EFFECT_NAMES, getFilter, applyPreviewEffect, clearPreviewEffect } from "./shaders.js";
import { AUDIO_EFFECTS, applyAudioEffectNode, clearAppliedAudioEffect } from "./AudioEffects.js";
const EFFECTS = EFFECT_NAMES;
function App() {
  const [clips, setClips] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [activeLibraryTab, setActiveLibraryTab] = useState("pool");
  const previewRef = useRef();
  const videoRef = useRef();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(0);
  const [transitions, setTransitions] = useState({});
  const mediaRecorderRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const recordedChunksRef = useRef([]);
  async function handleFiles(files) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("video/"));
    const newClips = await Promise.all(arr.map(async (f, i) => {
      const url = URL.createObjectURL(f);
      const meta = await getVideoMetadata(url);
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        url,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
        effect: "None",
        startTrim: 0,
        endTrim: Math.max(0, meta.duration),
        lane: "video"
        // default lane
      };
    }));
    setClips((prev) => prev.concat(newClips));
  }
  function getVideoMetadata(url) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => {
        resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        v.remove();
      };
    });
  }
  function removeClip(id) {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedClip === id) setSelectedClip(null);
  }
  useEffect(() => {
    let mounted = true;
    const v = videoRef.current;
    if (!v) return;
    let playTimeout = null;
    async function playSequence() {
      if (!mounted) return;
      if (clips.length === 0) {
        setIsPlaying(false);
        return;
      }
      setIsPlaying(true);
      for (let i = 0; i < clips.length; i++) {
        setPlayingIndex(i);
        const clip = clips[i];
        const start = clip.startTrim || 0;
        const end = clip.endTrim || clip.duration;
        v.src = clip.url;
        v.style.filter = getFilter(clip.effect);
        clearPreviewEffect(previewRef.current);
        applyPreviewEffect(clip.effect, v, previewRef.current);
        try {
          v.currentTime = Math.min(start, clip.duration - 0.05);
        } catch (e) {
        }
        await new Promise((res) => {
          const onLoaded = () => {
            v.currentTime = Math.min(start, v.duration - 0.05);
            try {
              v.muted = false;
            } catch (e) {
            }
            v.play();
          };
          const onTime = () => {
            if (v.currentTime + 0.01 >= end) {
              v.pause();
              cleanup();
              res();
            }
          };
          const onEnded = () => {
            cleanup();
            res();
          };
          function cleanup() {
            v.removeEventListener("loadedmetadata", onLoaded);
            v.removeEventListener("timeupdate", onTime);
            v.removeEventListener("ended", onEnded);
          }
          v.addEventListener("loadedmetadata", onLoaded);
          v.addEventListener("timeupdate", onTime);
          v.addEventListener("ended", onEnded);
        });
        const nextTransition = transitions[i];
        if (i < clips.length - 1 && nextTransition === "Crossfade") {
          const wrapper = previewRef.current;
          if (wrapper) {
            wrapper.classList.add("crossfade");
            clearTimeout(playTimeout);
            playTimeout = setTimeout(() => wrapper.classList.remove("crossfade"), 300);
          }
        }
      }
      clearPreviewEffect(previewRef.current);
      setIsPlaying(false);
    }
    if (isPlaying) {
      playSequence();
    }
    return () => {
      mounted = false;
      clearTimeout(playTimeout);
    };
  }, [isPlaying, clips, transitions]);
  function startPlayback() {
    if (isPlaying) return;
    setIsPlaying(true);
  }
  function stopPlayback() {
    setIsPlaying(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.src = "";
    }
  }
  async function startExport() {
    if (clips.length === 0) return alert("No clips to export.");
    setExporting(true);
    recordedChunksRef.current = [];
    const v = videoRef.current;
    if (!v) {
      setExporting(false);
      return;
    }
    const canvas = document.createElement("canvas");
    const cw = v.videoWidth || 640;
    const ch = v.videoHeight || 360;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    let rafId = null;
    function drawLoop() {
      try {
        if (v.readyState >= 2) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        }
      } catch (e) {
      }
      rafId = requestAnimationFrame(drawLoop);
    }
    let stream;
    try {
      stream = canvas.captureStream(30);
    } catch (err) {
      setExporting(false);
      return alert("Export not supported in this browser (canvas.captureStream unavailable).");
    }
    const rec = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });
    mediaRecorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) recordedChunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      cancelAnimationFrame(rafId);
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "xls-project.webm";
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
      canvas.remove();
    };
    drawLoop();
    try {
      rec.start();
    } catch (err) {
      cancelAnimationFrame(rafId);
      setExporting(false);
      return alert("Failed to start MediaRecorder: " + (err && err.message));
    }
    setTimeout(() => startPlayback(), 100);
    const totalSeconds = clips.reduce((acc, c) => acc + Math.max(0, c.endTrim - c.startTrim), 0);
    const safety = Math.max(1, Math.ceil(totalSeconds)) * 1e3 + 800;
    setTimeout(() => {
      stopPlayback();
      try {
        rec.stop();
      } catch (e) {
      }
    }, safety);
  }
  function updateClip(id, updates) {
    setClips((prev) => prev.map((c) => c.id === id ? { ...c, ...updates } : c));
  }
  function addToTimelineDragged(id) {
    setSelectedClip(id);
  }
  function setTransition(index, name) {
    setTransitions((prev) => ({ ...prev, [index]: name }));
  }
  function newProject() {
    if (!confirm("Start a new project? This will remove current clips.")) return;
    clips.forEach((c) => URL.revokeObjectURL(c.url));
    setClips([]);
    setTransitions({});
  }
  function importProject() {
    alert("Import project not implemented in this demo.");
  }
  function saveProject() {
    alert("Save project not implemented in this demo.");
  }
  function moveClipToLane(id, lane) {
    updateClip(id, { lane });
  }
  return /* @__PURE__ */ jsxDEV("div", { className: "app", children: [
    /* @__PURE__ */ jsxDEV("header", { className: "menu", children: [
      /* @__PURE__ */ jsxDEV("div", { className: "menu-left", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: [
          "File",
          /* @__PURE__ */ jsxDEV("div", { className: "dropdown", children: [
            /* @__PURE__ */ jsxDEV("button", { onClick: newProject, children: "New" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 231,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("button", { onClick: saveProject, children: "Save" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 232,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("button", { onClick: importProject, children: "Import" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 233,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("label", { className: "file-input", children: [
              "Open...",
              /* @__PURE__ */ jsxDEV("input", { type: "file", accept: "video/*", multiple: true, onChange: (e) => handleFiles(e.target.files) }, void 0, false, {
                fileName: "<stdin>",
                lineNumber: 236,
                columnNumber: 17
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 234,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 230,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 229,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: "Edit" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 240,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: "Tools" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 241,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: "Timeline" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 242,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: "Help" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 243,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "menu-item", children: "About" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 244,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 228,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("div", { className: "menu-right", children: [
        /* @__PURE__ */ jsxDEV("button", { onClick: startPlayback, disabled: isPlaying, children: "Play" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 247,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { onClick: stopPlayback, disabled: !isPlaying, children: "Stop" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 248,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("button", { onClick: startExport, disabled: exporting, children: exporting ? "Exporting..." : "Export" }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 249,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 246,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 227,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("main", { className: "main", children: [
      /* @__PURE__ */ jsxDEV("aside", { className: "library", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "library-tabs", children: [
          /* @__PURE__ */ jsxDEV("button", { className: activeLibraryTab === "pool" ? "active" : "", onClick: () => setActiveLibraryTab("pool"), children: "Media Pool" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 256,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("button", { className: activeLibraryTab === "generators" ? "active" : "", onClick: () => setActiveLibraryTab("generators"), children: "Generators" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 257,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("button", { className: activeLibraryTab === "vfx" ? "active" : "", onClick: () => setActiveLibraryTab("vfx"), children: "Video FX" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 258,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("button", { className: activeLibraryTab === "afx" ? "active" : "", onClick: () => setActiveLibraryTab("afx"), children: "Audio FX" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 259,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 255,
          columnNumber: 11
        }, this),
        activeLibraryTab === "pool" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
          /* @__PURE__ */ jsxDEV("h3", { children: "Media Pool" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 264,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "clip-list", children: [
            clips.map((c) => /* @__PURE__ */ jsxDEV(
              "div",
              {
                className: `clip-item ${selectedClip === c.id ? "selected" : ""}`,
                draggable: true,
                onDragStart: (e) => {
                  e.dataTransfer.setData("text/clip-id", c.id);
                },
                onClick: () => setSelectedClip(c.id),
                children: [
                  /* @__PURE__ */ jsxDEV("video", { src: c.url, width: "120", height: "70" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 271,
                    columnNumber: 21
                  }, this),
                  /* @__PURE__ */ jsxDEV("div", { className: "clip-meta", children: [
                    /* @__PURE__ */ jsxDEV("div", { className: "clip-name", children: c.file.name }, void 0, false, {
                      fileName: "<stdin>",
                      lineNumber: 273,
                      columnNumber: 23
                    }, this),
                    /* @__PURE__ */ jsxDEV("div", { className: "clip-duration", children: [
                      (c.duration || 0).toFixed(2),
                      "s"
                    ] }, void 0, true, {
                      fileName: "<stdin>",
                      lineNumber: 274,
                      columnNumber: 23
                    }, this),
                    /* @__PURE__ */ jsxDEV("div", { className: "clip-actions", children: [
                      /* @__PURE__ */ jsxDEV("button", { onClick: (ev) => {
                        ev.stopPropagation();
                        removeClip(c.id);
                      }, children: "Remove" }, void 0, false, {
                        fileName: "<stdin>",
                        lineNumber: 276,
                        columnNumber: 25
                      }, this),
                      /* @__PURE__ */ jsxDEV("button", { onClick: (ev) => {
                        ev.stopPropagation();
                        moveClipToLane(c.id, "audio");
                      }, children: "Move to Audio" }, void 0, false, {
                        fileName: "<stdin>",
                        lineNumber: 277,
                        columnNumber: 25
                      }, this),
                      /* @__PURE__ */ jsxDEV("button", { onClick: (ev) => {
                        ev.stopPropagation();
                        moveClipToLane(c.id, "video");
                      }, children: "Move to Video" }, void 0, false, {
                        fileName: "<stdin>",
                        lineNumber: 278,
                        columnNumber: 25
                      }, this)
                    ] }, void 0, true, {
                      fileName: "<stdin>",
                      lineNumber: 275,
                      columnNumber: 23
                    }, this)
                  ] }, void 0, true, {
                    fileName: "<stdin>",
                    lineNumber: 272,
                    columnNumber: 21
                  }, this)
                ]
              },
              c.id,
              true,
              {
                fileName: "<stdin>",
                lineNumber: 267,
                columnNumber: 19
              },
              this
            )),
            clips.length === 0 && /* @__PURE__ */ jsxDEV("div", { className: "empty", children: "No clips. Use File \u2192 Open or drop videos here." }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 283,
              columnNumber: 40
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 265,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "upload-zone", children: /* @__PURE__ */ jsxDEV("label", { className: "file-input big", children: [
            "+ Add Files",
            /* @__PURE__ */ jsxDEV("input", { type: "file", accept: "video/*", multiple: true, onChange: (e) => handleFiles(e.target.files) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 289,
              columnNumber: 19
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 287,
            columnNumber: 17
          }, this) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 286,
            columnNumber: 15
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 263,
          columnNumber: 13
        }, this),
        activeLibraryTab === "generators" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
          /* @__PURE__ */ jsxDEV("h3", { children: "Media Generators" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 297,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "empty", children: "Color bars, noise, text generators (placeholders)" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 298,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "gen-list", children: [
            /* @__PURE__ */ jsxDEV("button", { onClick: () => alert("Added Color Bars (placeholder)"), children: "Add Color Bars" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 300,
              columnNumber: 17
            }, this),
            /* @__PURE__ */ jsxDEV("button", { onClick: () => alert("Added Text Generator (placeholder)"), children: "Add Text" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 301,
              columnNumber: 17
            }, this),
            /* @__PURE__ */ jsxDEV("button", { onClick: () => alert("Added Noise (placeholder)"), children: "Add Noise" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 302,
              columnNumber: 17
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 299,
            columnNumber: 15
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 296,
          columnNumber: 13
        }, this),
        activeLibraryTab === "vfx" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
          /* @__PURE__ */ jsxDEV("h3", { children: "Video FX" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 309,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "fx-list", children: EFFECTS.filter((e) => e !== "None").map((f) => /* @__PURE__ */ jsxDEV(
            "button",
            {
              onClick: () => {
                if (selectedClip) {
                  updateClip(selectedClip, { effect: f });
                } else {
                  alert("Select a clip to apply.");
                }
              },
              children: f
            },
            f,
            false,
            {
              fileName: "<stdin>",
              lineNumber: 312,
              columnNumber: 19
            },
            this
          )) }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 310,
            columnNumber: 15
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 308,
          columnNumber: 13
        }, this),
        activeLibraryTab === "afx" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
          /* @__PURE__ */ jsxDEV("h3", { children: "Audio FX" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 331,
            columnNumber: 15
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "fx-list", children: [
            AUDIO_EFFECTS.filter((e) => e !== "None").map((ae) => /* @__PURE__ */ jsxDEV(
              "button",
              {
                onClick: () => {
                  if (selectedClip) {
                    updateClip(selectedClip, { audioEffect: ae });
                    alert(`Applied audio effect "${ae}" to selected clip (preview will use WebAudio when playing).`);
                  } else {
                    alert("Select a clip to apply an audio effect.");
                  }
                },
                children: ae
              },
              ae,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 334,
                columnNumber: 19
              },
              this
            )),
            /* @__PURE__ */ jsxDEV("button", { onClick: () => {
              if (selectedClip) {
                updateClip(selectedClip, { audioEffect: "None" });
                alert("Cleared audio effects on selected clip.");
              } else alert("Select a clip first.");
            }, children: "Clear Audio FX" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 348,
              columnNumber: 17
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 332,
            columnNumber: 15
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 330,
          columnNumber: 13
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "properties", children: [
          /* @__PURE__ */ jsxDEV("h4", { children: "Clip Properties" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 359,
            columnNumber: 13
          }, this),
          selectedClip ? (() => {
            const clip = clips.find((x) => x.id === selectedClip);
            if (!clip) return /* @__PURE__ */ jsxDEV("div", { children: "Select a clip" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 362,
              columnNumber: 33
            }, this);
            return /* @__PURE__ */ jsxDEV("div", { children: [
              /* @__PURE__ */ jsxDEV("div", { className: "prop-row", children: [
                /* @__PURE__ */ jsxDEV("label", { children: "Lane" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 366,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("select", { value: clip.lane || "video", onChange: (e) => updateClip(clip.id, { lane: e.target.value }), children: [
                  /* @__PURE__ */ jsxDEV("option", { value: "video", children: "Video" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 368,
                    columnNumber: 23
                  }, this),
                  /* @__PURE__ */ jsxDEV("option", { value: "audio", children: "Audio" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 369,
                    columnNumber: 23
                  }, this),
                  /* @__PURE__ */ jsxDEV("option", { value: "fx", children: "FX" }, void 0, false, {
                    fileName: "<stdin>",
                    lineNumber: 370,
                    columnNumber: 23
                  }, this)
                ] }, void 0, true, {
                  fileName: "<stdin>",
                  lineNumber: 367,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 365,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "prop-row", children: [
                /* @__PURE__ */ jsxDEV("label", { children: "Effect" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 374,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("select", { value: clip.effect, onChange: (e) => updateClip(clip.id, { effect: e.target.value }), children: EFFECTS.map((e) => /* @__PURE__ */ jsxDEV("option", { value: e, children: e }, e, false, {
                  fileName: "<stdin>",
                  lineNumber: 376,
                  columnNumber: 41
                }, this)) }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 375,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 373,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "prop-row", children: [
                /* @__PURE__ */ jsxDEV("label", { children: "Audio Effect" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 381,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("select", { value: clip.audioEffect || "None", onChange: (e) => updateClip(clip.id, { audioEffect: e.target.value }), children: AUDIO_EFFECTS.map((a) => /* @__PURE__ */ jsxDEV("option", { value: a, children: a }, a, false, {
                  fileName: "<stdin>",
                  lineNumber: 383,
                  columnNumber: 47
                }, this)) }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 382,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 380,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "prop-row", children: [
                /* @__PURE__ */ jsxDEV("label", { children: "Trim Start (s)" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 387,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("input", { type: "number", min: "0", step: "0.1", value: clip.startTrim, onChange: (e) => updateClip(clip.id, { startTrim: Math.min(Number(e.target.value), clip.endTrim - 0.05) }) }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 388,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 386,
                columnNumber: 19
              }, this),
              /* @__PURE__ */ jsxDEV("div", { className: "prop-row", children: [
                /* @__PURE__ */ jsxDEV("label", { children: "Trim End (s)" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 391,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("input", { type: "number", max: clip.duration, step: "0.1", value: clip.endTrim, onChange: (e) => updateClip(clip.id, { endTrim: Math.max(Number(e.target.value), clip.startTrim + 0.05) }) }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 392,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 390,
                columnNumber: 19
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 364,
              columnNumber: 17
            }, this);
          })() : /* @__PURE__ */ jsxDEV("div", { children: "Select a clip to edit properties" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 396,
            columnNumber: 20
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 358,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 254,
        columnNumber: 9
      }, this),
      /* @__PURE__ */ jsxDEV("section", { className: "editor", children: [
        /* @__PURE__ */ jsxDEV("div", { className: "preview-area", ref: previewRef, children: /* @__PURE__ */ jsxDEV("div", { className: "preview-inner", children: /* @__PURE__ */ jsxDEV("video", { ref: videoRef, width: "640", height: "360", playsInline: true }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 403,
          columnNumber: 15
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 402,
          columnNumber: 13
        }, this) }, void 0, false, {
          fileName: "<stdin>",
          lineNumber: 401,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "multi-track", children: [
          /* @__PURE__ */ jsxDEV("div", { className: "track-headers", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "track-header", children: "Video" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 409,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "track-header", children: "Audio" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 410,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "track-header", children: "FX" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 411,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 408,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("div", { className: "track-rows", children: [
            /* @__PURE__ */ jsxDEV("div", { className: "track-row", "data-lane": "video", children: /* @__PURE__ */ jsxDEV(
              Timeline,
              {
                clips: clips.filter((c) => (c.lane || "video") === "video"),
                setClips: (newSubset) => {
                  const other = clips.filter((c) => (c.lane || "video") !== "video");
                  setClips([...other, ...newSubset]);
                },
                onDragAdd: addToTimelineDragged,
                transitions,
                setTransition,
                setSelectedClip
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 415,
                columnNumber: 17
              },
              this
            ) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 414,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "track-row", "data-lane": "audio", children: /* @__PURE__ */ jsxDEV(
              Timeline,
              {
                clips: clips.filter((c) => c.lane === "audio"),
                setClips: (newSubset) => {
                  const other = clips.filter((c) => c.lane !== "audio");
                  setClips([...other, ...newSubset]);
                },
                onDragAdd: addToTimelineDragged,
                transitions,
                setTransition,
                setSelectedClip
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 430,
                columnNumber: 17
              },
              this
            ) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 429,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "track-row", "data-lane": "fx", children: /* @__PURE__ */ jsxDEV(
              Timeline,
              {
                clips: clips.filter((c) => c.lane === "fx"),
                setClips: (newSubset) => {
                  const other = clips.filter((c) => c.lane !== "fx");
                  setClips([...other, ...newSubset]);
                },
                onDragAdd: addToTimelineDragged,
                transitions,
                setTransition,
                setSelectedClip
              },
              void 0,
              false,
              {
                fileName: "<stdin>",
                lineNumber: 444,
                columnNumber: 17
              },
              this
            ) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 443,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 413,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 407,
          columnNumber: 11
        }, this),
        /* @__PURE__ */ jsxDEV("div", { className: "transitions-panel", children: [
          /* @__PURE__ */ jsxDEV("label", { children: "Transition between clips:" }, void 0, false, {
            fileName: "<stdin>",
            lineNumber: 460,
            columnNumber: 13
          }, this),
          /* @__PURE__ */ jsxDEV("select", { onChange: (e) => setTransition(Number(e.target.dataset.index), e.target.value), children: [
            /* @__PURE__ */ jsxDEV("option", { children: "None" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 462,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("option", { children: "Crossfade" }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 463,
              columnNumber: 15
            }, this)
          ] }, void 0, true, {
            fileName: "<stdin>",
            lineNumber: 461,
            columnNumber: 13
          }, this)
        ] }, void 0, true, {
          fileName: "<stdin>",
          lineNumber: 459,
          columnNumber: 11
        }, this)
      ] }, void 0, true, {
        fileName: "<stdin>",
        lineNumber: 400,
        columnNumber: 9
      }, this)
    ] }, void 0, true, {
      fileName: "<stdin>",
      lineNumber: 253,
      columnNumber: 7
    }, this),
    /* @__PURE__ */ jsxDEV("footer", { className: "footer", children: "XLS Video Editor 0.0.3 \u2014 Simple timeline, effects, transitions, export" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 469,
      columnNumber: 7
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 226,
    columnNumber: 5
  }, this);
}
export {
  App as default
};
