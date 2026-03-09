import { jsxDEV } from "react/jsx-dev-runtime";
import React from "react";
const PIXELS_PER_SECOND = 60;
function Timeline({ clips, setClips, onDragAdd, transitions, setTransition, setSelectedClip }) {
  function onDragStart(e, idx) {
    e.dataTransfer.setData("text/timeline-index", idx.toString());
  }
  function onDropReorder(e, toIdx) {
    const fromIdx = e.dataTransfer.getData("text/timeline-index");
    const clipId = e.dataTransfer.getData("text/clip-id");
    if (clipId) {
      const idx = clips.findIndex((c) => c.id === clipId);
      if (idx !== -1) {
        const arr = [...clips];
        const [item] = arr.splice(idx, 1);
        arr.splice(toIdx, 0, item);
        setClips(arr);
      }
    } else if (fromIdx !== "") {
      const fi = Number(fromIdx);
      if (isNaN(fi)) return;
      const arr = [...clips];
      const [item] = arr.splice(fi, 1);
      arr.splice(toIdx, 0, item);
      setClips(arr);
    }
  }
  function onDragOver(e) {
    e.preventDefault();
  }
  return /* @__PURE__ */ jsxDEV("div", { className: "timeline", onDragOver, children: /* @__PURE__ */ jsxDEV("div", { className: "timeline-track", children: [
    clips.map((c, idx) => {
      const width = Math.max(40, Math.max(0, c.endTrim - c.startTrim || c.duration) * PIXELS_PER_SECOND);
      return /* @__PURE__ */ jsxDEV(
        "div",
        {
          className: "timeline-clip",
          draggable: true,
          onDragStart: (e) => onDragStart(e, idx),
          onDrop: (e) => onDropReorder(e, idx),
          onClick: () => setSelectedClip(c.id),
          title: `${c.file.name} (${(c.endTrim - c.startTrim).toFixed(2)}s)`,
          style: { width },
          children: [
            /* @__PURE__ */ jsxDEV("div", { className: "timeline-thumb", children: c.file.name.split(".")[0] }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 56,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "timeline-effect", children: c.effect }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 57,
              columnNumber: 15
            }, this),
            /* @__PURE__ */ jsxDEV("div", { className: "timeline-ctrls", children: /* @__PURE__ */ jsxDEV("label", { children: [
              "Transition",
              /* @__PURE__ */ jsxDEV("select", { value: transitions[idx] || "None", onChange: (e) => setTransition(idx, e.target.value), children: [
                /* @__PURE__ */ jsxDEV("option", { children: "None" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 61,
                  columnNumber: 21
                }, this),
                /* @__PURE__ */ jsxDEV("option", { children: "Crossfade" }, void 0, false, {
                  fileName: "<stdin>",
                  lineNumber: 62,
                  columnNumber: 21
                }, this)
              ] }, void 0, true, {
                fileName: "<stdin>",
                lineNumber: 60,
                columnNumber: 19
              }, this)
            ] }, void 0, true, {
              fileName: "<stdin>",
              lineNumber: 59,
              columnNumber: 17
            }, this) }, void 0, false, {
              fileName: "<stdin>",
              lineNumber: 58,
              columnNumber: 15
            }, this)
          ]
        },
        c.id,
        true,
        {
          fileName: "<stdin>",
          lineNumber: 46,
          columnNumber: 13
        },
        this
      );
    }),
    clips.length === 0 && /* @__PURE__ */ jsxDEV("div", { className: "timeline-empty", children: "Timeline is empty \u2014 add clips" }, void 0, false, {
      fileName: "<stdin>",
      lineNumber: 69,
      columnNumber: 32
    }, this)
  ] }, void 0, true, {
    fileName: "<stdin>",
    lineNumber: 42,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "<stdin>",
    lineNumber: 41,
    columnNumber: 5
  }, this);
}
export {
  Timeline as default
};
