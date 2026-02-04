import { useEffect, useMemo, useState } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";
import p5 from "p5";

const FALLBACK_URL = "http://localhost:8100/logs?limit=300";

const levelColors = {
  DEBUG: "text-sky-300",
  INFO: "text-emerald-300",
  WARNING: "text-amber-300",
  ERROR: "text-rose-300",
  CRITICAL: "text-red-400",
};

const levelBg = {
  DEBUG: "bg-sky-500/10 ring-1 ring-sky-500/40",
  INFO: "bg-emerald-500/10 ring-1 ring-emerald-500/40",
  WARNING: "bg-amber-500/10 ring-1 ring-amber-500/40",
  ERROR: "bg-rose-500/10 ring-1 ring-rose-500/40",
  CRITICAL: "bg-red-500/15 ring-1 ring-red-500/40",
};

function parseLine(line) {
  const match = line.match(
    /^(\S+Z)\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+(.*)$/
  );
  if (!match) {
    return { timestamp: "", level: "INFO", message: line };
  }
  return {
    timestamp: match[1],
    level: match[2],
    message: match[3],
  };
}

function MovementSketch({ positions }) {
  const sketch = useMemo(() => {
    return (p) => {
      let rotX = -p.PI / 6;
      let rotY = p.PI / 6;
      let zoom = 1.0;
      let lastMouseX, lastMouseY;
      let currentPositions = []; // Store positions locally

      p.setup = () => {
        p.createCanvas(p.windowWidth / 2.2, 550, p.WEBGL);
        currentPositions = positions;
      };

      p.updateWithProps = (props) => {
        if (props.positions) {
          currentPositions = props.positions;
        }
      };

      p.mousePressed = () => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          lastMouseX = p.mouseX;
          lastMouseY = p.mouseY;
        }
      }

      p.mouseDragged = () => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          rotY += (p.mouseX - lastMouseX) * 0.01;
          rotX += (p.mouseY - lastMouseY) * 0.01;
          lastMouseX = p.mouseX;
          lastMouseY = p.mouseY;
        }
      };
      
      p.mouseWheel = (event) => {
        if (p.mouseX > 0 && p.mouseX < p.width && p.mouseY > 0 && p.mouseY < p.height) {
          if (event.delta > 0) {
            zoom *= 1.1;
          } else {
            zoom *= 0.9;
          }
          return false; // prevent page scrolling
        }
      }

      p.draw = () => {
        p.background(10, 20, 30);
        
        p.translate(0, 0, -200 * zoom);
        p.rotateX(rotX);
        p.rotateY(rotY);

        // --- Dynamic Scaling ---
        let maxExtent = 0;
        for (const pos of currentPositions) {
            const extent = Math.max(Math.abs(pos.x), Math.abs(pos.y), Math.abs(pos.z));
            if (extent > maxExtent) {
                maxExtent = extent;
            }
        }

        const desiredSize = 100; // Fit path within this size relative to axes
        const defaultScale = 10;   // Use this zoom for small movements
        let dynamicScale;

        if (maxExtent < desiredSize / defaultScale) { // If path is small
            dynamicScale = defaultScale;
        } else { // If path is large, scale it down to fit
            dynamicScale = desiredSize / maxExtent;
        }

        // Draw axes (these do not scale with the path)
        p.push();
        p.strokeWeight(1);
        p.stroke(255, 0, 0, 150); // X-axis
        p.line(0, 0, 0, 150, 0, 0);
        p.stroke(0, 255, 0, 150); // Y-axis
        p.line(0, 0, 0, 0, 150, 0);
        p.stroke(0, 0, 255, 150); // Z-axis
        p.line(0, 0, 0, 0, 0, 150);
        p.pop();
        
        // Draw the scaled path
        p.stroke(255, 255, 255, 200);
        p.strokeWeight(2);
        p.noFill();

        for (let i = 0; i < currentPositions.length - 1; i++) {
          const pos1 = currentPositions[i];
          const pos2 = currentPositions[i+1];
          p.line(
            pos1.x * dynamicScale, pos1.y * dynamicScale, pos1.z * dynamicScale,
            pos2.x * dynamicScale, pos2.y * dynamicScale, pos2.z * dynamicScale
            );
        }
      };
    }
  }, []);

  return <ReactP5Wrapper sketch={sketch} positions={positions} />;
}


function useLogs(url, intervalMs = 2500) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLogs = async () =>
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLines(data.lines ?? []);
        setError(null);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    fetchLogs();
    const id = setInterval(fetchLogs, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs]);

  return { lines, loading, error, lastUpdated, refresh: fetchLogs };
}

function App() {
  const url = import.meta.env.VITE_MCP_LOG_URL || FALLBACK_URL;
  const { lines, loading, error, lastUpdated, refresh } = useLogs(url);

  const [gotoCoords, setGotoCoords] = useState({ x: 0, y: 0, z: 0 });
  const [positions, setPositions] = useState([]);

  const parsed = useMemo(() => lines.map(parseLine), [lines]);
  
  useEffect(() => {
    const newPositions = [];
    lines.forEach(line => {
      const parsedLine = parseLine(line);
      if (parsedLine.message.startsWith("Generated Data:")) {
        try {
          const jsonString = parsedLine.message.substring("Generated Data: ".length);
          const data = JSON.parse(jsonString);
          if (data.position) {
            newPositions.push(data.position);
          }
        } catch (e) {
          console.error("Failed to parse position data:", e);
        }
      }
    });

    setPositions(newPositions);
  }, [lines]);

  const handleGotoChange = (e) => {
    const { name, value } = e.target;
    setGotoCoords(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleGotoSubmit = async (e) => {
    e.preventDefault();
    try {
      await fetch("http://localhost:8100/mcp/goto_target", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(gotoCoords),
      });
    } catch (err) {
      console.error("Failed to send GOTO command:", err);
    }
  };


  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            MCP Server Logs
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Live log viewer & 3D Visualizer</h1>
              <p className="text-slate-300">
                Showing log lines from
                <code className="mx-2 rounded bg-slate-900 px-2 py-1 text-sm font-mono text-emerald-200">{url}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refresh}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40"
              >
                Refresh now
              </button>
              <span className="text-sm text-slate-400">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first fetch...'}
              </span>
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Could not fetch logs: {error}. Ensure the MCP log endpoint is running.
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 text-sm text-slate-300">
              <span>{loading ? 'Loading…' : `${parsed.length} lines`}</span>
              <span className="text-slate-500">Auto-refresh every 2.5s</span>
            </div>

            <div className="h-[70vh] overflow-y-auto divide-y divide-slate-800 font-mono text-sm">
              {parsed.length === 0 && !loading ? (
                <div className="p-4 text-slate-400">No log lines yet.</div>
              ) : (
                parsed.map((line, idx) => {
                  const level = line.level || 'INFO'
                  return (
                    <div
                      key={`${line.timestamp}-${idx}`}
                      className="flex gap-3 px-4 py-2 hover:bg-slate-800/40"
                    >
                      <div className="w-36 shrink-0 text-xs text-slate-400">{line.timestamp}</div>
                      <span
                        className={`inline-flex h-6 min-w-16 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                          levelBg[level] || levelBg.INFO
                        } ${levelColors[level] || levelColors.INFO}`}
                      >
                        {level}
                      </span>
                      <div className="flex-1 whitespace-pre-wrap break-words text-slate-100">{line.message}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl p-4">
                  <h2 className="text-xl font-semibold mb-4">GOTO Control</h2>
                  <form onSubmit={handleGotoSubmit} className="flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          X
                          <input type="number" name="x" value={gotoCoords.x} onChange={handleGotoChange} className="w-full rounded-md bg-slate-800 px-3 py-2 text-slate-50 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          Y
                          <input type="number" name="y" value={gotoCoords.y} onChange={handleGotoChange} className="w-full rounded-md bg-slate-800 px-3 py-2 text-slate-50 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          Z
                          <input type="number" name="z" value={gotoCoords.z} onChange={handleGotoChange} className="w-full rounded-md bg-slate-800 px-3 py-2 text-slate-50 ring-1 ring-inset ring-slate-700 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <button type="submit" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-400">
                          Send GOTO
                      </button>
                  </form>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl p-4">
                <h2 className="text-xl font-semibold mb-4">3D Movement Visualisation</h2>
                <MovementSketch positions={positions} />
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App