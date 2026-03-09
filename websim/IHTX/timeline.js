import React from "react";

/*
  Very simple timeline renderer:
  - Displays clips in order horizontally scaled by duration
  - Allows dragging to reorder
  - Allows clicking a clip to select
*/

const PIXELS_PER_SECOND = 60;

export default function Timeline({ clips, setClips, onDragAdd, transitions, setTransition, setSelectedClip }) {
  function onDragStart(e, idx) {
    e.dataTransfer.setData("text/timeline-index", idx.toString());
  }
  function onDropReorder(e, toIdx) {
    const fromIdx = e.dataTransfer.getData("text/timeline-index");
    const clipId = e.dataTransfer.getData("text/clip-id");
    if (clipId) {
      // drop from library - ensure clip is already in clips list and move to end or toIdx
      const idx = clips.findIndex(c => c.id === clipId);
      if (idx !== -1) {
        // move existing clip to new position
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
  function onDragOver(e) { e.preventDefault(); }

  return (
    <div className="timeline" onDragOver={onDragOver}>
      <div className="timeline-track">
        {clips.map((c, idx) => {
          const width = Math.max(40, (Math.max(0, (c.endTrim - c.startTrim || c.duration)) * PIXELS_PER_SECOND));
          return (
            <div
              key={c.id}
              className="timeline-clip"
              draggable
              onDragStart={e => onDragStart(e, idx)}
              onDrop={e => onDropReorder(e, idx)}
              onClick={() => setSelectedClip(c.id)}
              title={`${c.file.name} (${(c.endTrim - c.startTrim).toFixed(2)}s)`}
              style={{ width }}
            >
              <div className="timeline-thumb">{c.file.name.split(".")[0]}</div>
              <div className="timeline-effect">{c.effect}</div>
              <div className="timeline-ctrls">
                <label>Transition
                  <select value={transitions[idx] || "None"} onChange={e => setTransition(idx, e.target.value)}>
                    <option>None</option>
                    <option>Crossfade</option>
                  </select>
                </label>
              </div>
            </div>
          );
        })}
        {clips.length === 0 && <div className="timeline-empty">Timeline is empty — add clips</div>}
      </div>
    </div>
  );
}