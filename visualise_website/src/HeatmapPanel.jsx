import { useEffect, useRef, useMemo } from "react";

const COLS = 10;
const ROWS = 10;
const MAX_PATH_LENGTH = 600;

function HeatmapPanel({ positions }) {
  const canvasRefs = {
    temp: useRef(null),
    humidity: useRef(null),
  };

  // Grid data for each sensor type
  const gridData = useMemo(() => {
    const tempGrid = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));
    const humGrid = Array(COLS).fill(0).map(() => Array(ROWS).fill(0));

    const path = [];

    positions.forEach((pos) => {
      // Map world coords (-100..100) → grid (0..9) using x and y only
      let c = Math.floor(((pos.x + 100) / 200) * COLS);
      let r = Math.floor(((pos.y + 100) / 200) * ROWS);

      // Safety clamp
      c = Math.max(0, Math.min(COLS - 1, c));
      r = Math.max(0, Math.min(ROWS - 1, r));

      tempGrid[c][r] = pos.temp;
      humGrid[c][r] = pos.humidity;

      path.push({ x: c, y: r });
    });

    // Limit path length
    const trimmedPath = path.slice(-MAX_PATH_LENGTH);

    // Current position is last position
    const currentPos = positions.length > 0 
      ? { 
          c: Math.max(0, Math.min(COLS - 1, Math.floor(((positions[positions.length - 1].x + 100) / 200) * COLS))),
          r: Math.max(0, Math.min(ROWS - 1, Math.floor(((positions[positions.length - 1].y + 100) / 200) * ROWS)))
        }
      : null;

    return {
      tempGrid,
      humGrid,
      path: trimmedPath,
      currentPos,
    };
  }, [positions]);

  useEffect(() => {
    const panels = [
      { ref: canvasRefs.temp, grid: gridData.tempGrid, min: 15, max: 35, title: "Temperature" },
      { ref: canvasRefs.humidity, grid: gridData.humGrid, min: 30, max: 90, title: "Humidity" },
    ];

    panels.forEach(({ ref, grid, min, max, title }) => {
      const canvas = ref.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;
      const scale = width / COLS;

      // Clear canvas
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Draw heatmap
      for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
          const v = grid[i][j];
          if (v === 0) continue;

          const t = Math.max(0, Math.min(1, (v - min) / (max - min)));

          // Color gradient: blue → green → red
          let color;
          if (t < 0.5) {
            const ratio = t * 2;
            const r = Math.floor(0 * (1 - ratio) + 0 * ratio);
            const g = Math.floor(0 * (1 - ratio) + 255 * ratio);
            const b = Math.floor(200 * (1 - ratio) + 0 * ratio);
            color = `rgba(${r}, ${g}, ${b}, 0.7)`;
          } else {
            const ratio = (t - 0.5) * 2;
            const r = Math.floor(0 * (1 - ratio) + 255 * ratio);
            const g = Math.floor(255 * (1 - ratio) + 0 * ratio);
            const b = Math.floor(0 * (1 - ratio) + 0 * ratio);
            color = `rgba(${r}, ${g}, ${b}, 0.7)`;
          }

          ctx.fillStyle = color;
          ctx.fillRect(i * scale, j * scale, scale, scale);
        }
      }

      // Draw grid lines
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1;

      for (let i = 0; i <= COLS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * scale, 0);
        ctx.lineTo(i * scale, height);
        ctx.stroke();
      }

      for (let j = 0; j <= ROWS; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * scale);
        ctx.lineTo(width, j * scale);
        ctx.stroke();
      }

      // Draw labels
      ctx.fillStyle = "#000000";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Column numbers (top)
      for (let c = 0; c < COLS; c++) {
        ctx.fillText((c + 1).toString(), c * scale + scale / 2, scale / 2);
      }

      // Row numbers (left)
      for (let r = 0; r < ROWS; r++) {
        ctx.fillText((r + 1).toString(), scale / 2, r * scale + scale / 2);
      }

      // Draw path
      if (gridData.path.length > 1) {
        ctx.strokeStyle = "rgba(255, 200, 0, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();

        gridData.path.forEach((p, idx) => {
          const x = p.x * scale + scale / 2;
          const y = p.y * scale + scale / 2;

          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
      }

      // Draw drone
      if (gridData.currentPos) {
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.arc(
          gridData.currentPos.c * scale + scale / 2,
          gridData.currentPos.r * scale + scale / 2,
          5,
          0,
          2 * Math.PI
        );
        ctx.fill();
      }

      // Draw title
      ctx.fillStyle = "#000000";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(title, 5, 5);
    });
  }, [gridData]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-2xl p-4">
      <h2 className="text-xl font-semibold mb-4">2D Heatmap Panels</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <canvas
            ref={canvasRefs.temp}
            width={400}
            height={400}
            className="w-full border border-slate-300 rounded"
          />
        </div>
        <div className="flex flex-col">
          <canvas
            ref={canvasRefs.humidity}
            width={400}
            height={400}
            className="w-full border border-slate-300 rounded"
          />
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-600 flex gap-4 justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Drone position</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span>Path trail</span>
        </div>
      </div>
    </div>
  );
}

export default HeatmapPanel;
