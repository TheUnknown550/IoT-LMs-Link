import { useEffect, useMemo, useState } from "react";
import { ReactP5Wrapper } from "react-p5-wrapper";
import p5 from "p5";

const FALLBACK_URL = "http://localhost:8100/logs?limit=300";

const levelColors = {
  DEBUG: "text-sky-700",
  INFO: "text-emerald-700",
  WARNING: "text-amber-700",
  ERROR: "text-rose-700",
  CRITICAL: "text-red-700",
};

const levelBg = {
  DEBUG: "bg-sky-100/80 ring-1 ring-sky-500/30",
  INFO: "bg-emerald-100/80 ring-1 ring-emerald-500/30",
  WARNING: "bg-amber-100/80 ring-1 ring-amber-500/30",
  ERROR: "bg-rose-100/80 ring-1 ring-rose-500/30",
  CRITICAL: "bg-red-100/80 ring-1 ring-red-500/30",
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

function MovementSketch({ positions, gotoCoords, heatmapMode }) {
  const sketch = useMemo(() => {
    // Helper function to map a value to a color
    function getHeatmapColor(p, value, min, max) {
      if (value === undefined) {
        return p.color(20, 20, 20, 200); // Default color for missing data
      }
      const valueMap = p.constrain(value, min, max);
      const r = p.map(valueMap, min, max, 50, 255);
      const b = p.map(valueMap, min, max, 255, 50);
      return p.color(r, 100, b, 200);
    }

    return (p) => {
      let rotX = -p.PI / 6;
      let rotY = p.PI / 6;
      let zoom = 1.0;
      let lastMouseX, lastMouseY;
      let currentGoto = { x: 0, y: 0, z: 0 };
      let currentPositions = []; // Store positions locally
      const scaleFactor = 10; // Adjust this value to scale the visualization

      p.setup = () => {
        p.createCanvas(p.windowWidth / 2.5, 400, p.WEBGL);
        currentPositions = positions;
      };

      p.updateWithProps = (props) => {
        if (props.positions) {
          currentPositions = props.positions;
        }
        if (props.gotoCoords) {
          currentGoto = props.gotoCoords;
        }
        // heatmapMode is a string, so it's fine without a deep copy/check
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
        p.background(250, 250, 250);
        
        p.translate(0, 0, -200 * zoom);
        p.rotateX(rotX);
        p.rotateY(rotY);

        // Draw axes
        p.push();
        p.strokeWeight(1);
        p.stroke(255, 0, 0, 150); p.line(0, 0, 0, 150, 0, 0);
        p.stroke(0, 255, 0, 150); p.line(0, 0, 0, 0, 150, 0);
        p.stroke(0, 0, 255, 150); p.line(0, 0, 0, 0, 0, 150);
        p.pop();
        
        p.noFill();
        
        const dataKey = heatmapMode === 'temp' ? 'temp' : 'humidity';
        const values = currentPositions.map(p => p[dataKey]).filter(v => v !== undefined);
        console.log("Values for heatmap:", values);
        const defaultMin = dataKey === 'temp' ? 15 : 40;
        const defaultMax = dataKey === 'temp' ? 35 : 80;
        const minVal = values.length > 0 ? Math.min(...values) : defaultMin;
        const maxVal = values.length > 0 ? Math.max(...values) : defaultMax;

        p.strokeWeight(4);

        for (let i = 0; i < currentPositions.length - 1; i++) {
          const pos1 = currentPositions[i];
          const pos2 = currentPositions[i + 1];

          const startColor = getHeatmapColor(p, pos1[dataKey], minVal, maxVal);
          const endColor = getHeatmapColor(p, pos2[dataKey], minVal, maxVal);

          const segments = 5;

          for (let j = 0; j < segments; j++) {
            const amt1 = j / segments;
            const amt2 = (j + 1) / segments;

            const c = p.lerpColor(startColor, endColor, amt1);
            p.stroke(c);

            const x1 = pos1.x * scaleFactor;
            const y1 = pos1.y * scaleFactor;
            const z1 = pos1.z * scaleFactor;
            const x2 = pos2.x * scaleFactor;
            const y2 = pos2.y * scaleFactor;
            const z2 = pos2.z * scaleFactor;

            const sx = p.lerp(x1, x2, amt1);
            const sy = p.lerp(y1, y2, amt1);
            const sz = p.lerp(z1, z2, amt1);

            const ex = p.lerp(x1, x2, amt2);
            const ey = p.lerp(y1, y2, amt2);
            const ez = p.lerp(z1, z2, amt2);

            p.line(sx, sy, sz, ex, ey, ez);
          }
        }

        // Draw target location
        p.push();
        p.noStroke();
        p.fill(0, 0, 255, 100);
        p.translate(currentGoto.x * scaleFactor, currentGoto.y * scaleFactor, currentGoto.z * scaleFactor);
        p.sphere(1 * scaleFactor);
        p.pop();

      };
    }
  }, [heatmapMode]); // Re-create the sketch if the mode changes

  return <ReactP5Wrapper sketch={sketch} positions={positions} gotoCoords={gotoCoords} />;
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
        // console.log("Fetched data:", data);
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
  const [temperature, setTemperature] = useState(0);
  const [humidity, setHumidity] = useState(0);
  const [heatmapMode, setHeatmapMode] = useState('temp'); // 'temp' or 'humidity'


  const parsed = useMemo(() => lines.map(parseLine), [lines]);
  
  useEffect(() => {
    const newPositions = [];
    const dataRegex = /POSITION x=([\d.-]+),\s*y=([\d.-]+),\s*z=([\d.-]+)\s*\|\s*TEMP=([\d.-]+)C\s*\|\s*HUMIDITY=([\d.-]+)%/;

    lines.forEach(line => {
      const parsedLine = parseLine(line);
      const match = parsedLine.message.match(dataRegex);

      if (match) {
        try {
          const pos = {
            x: parseFloat(match[1]),
            y: parseFloat(match[2]),
            z: parseFloat(match[3]),
            temp: parseFloat(match[4]),
            humidity: parseFloat(match[5]),
          };
          newPositions.push(pos);
        } catch (e) {
          console.error("Failed to parse enriched data:", e);
        }
      }
    });

    if (newPositions.length > 0) {
        const lastPos = newPositions[newPositions.length - 1];
        if(lastPos.temp) setTemperature(lastPos.temp);
        if(lastPos.humidity) setHumidity(lastPos.humidity);
    }
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
    <div className="min-h-screen bg-gray-100 text-slate-800 px-4 py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-400/40">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            MCP Server Logs
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Live log viewer & 3D Visualizer</h1>
              <p className="text-slate-500">
                Showing log lines from
                <code className="mx-2 rounded bg-slate-200 px-2 py-1 text-sm font-mono text-emerald-700">{url}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refresh}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40"
              >
                Refresh now
              </button>
              <span className="text-sm text-slate-500">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first fetch...'}
              </span>
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-100/50 px-4 py-3 text-sm text-amber-800">
              Could not fetch logs: {error}. Ensure the MCP log endpoint is running.
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>{loading ? 'Loading…' : `${parsed.length} lines`}</span>
              <span className="text-slate-500">Auto-refresh every 2.5s</span>
            </div>

            <div className="h-[70vh] overflow-y-auto divide-y divide-slate-200 font-mono text-sm">
              {parsed.length === 0 && !loading ? (
                <div className="p-4 text-slate-500">No log lines yet.</div>
              ) : (
                [...parsed].reverse().map((line, idx) => {
                  const level = line.level || 'INFO'
                  return (
                    <div
                      key={`${line.timestamp}-${idx}`}
                      className="flex gap-3 px-4 py-2 hover:bg-slate-200/40"
                    >
                      <div className="w-36 shrink-0 text-xs text-slate-500">{line.timestamp}</div>
                      <span
                        className={`inline-flex h-6 min-w-16 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                          levelBg[level] || levelBg.INFO
                        } ${levelColors[level] || levelColors.INFO}`}
                      >
                        {level}
                      </span>
                      <div className="flex-1 whitespace-pre-wrap break-words text-slate-800">{line.message}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-2xl p-4">
                  <h2 className="text-xl font-semibold mb-4">GOTO Control</h2>
                  <form onSubmit={handleGotoSubmit} className="flex items-end gap-2">
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          X
                          <input type="number" name="x" value={gotoCoords.x} onChange={handleGotoChange} className="w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          Y
                          <input type="number" name="y" value={gotoCoords.y} onChange={handleGotoChange} className="w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                          Z
                          <input type="number" name="z" value={gotoCoords.z} onChange={handleGotoChange} className="w-full rounded-md bg-slate-100 px-3 py-2 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-emerald-500" />
                      </label>
                      <button type="submit" className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400">
                          Send GOTO
                      </button>
                  </form>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-2xl p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">
                    3D Visualisation
                  </h2>
                  <button
                    onClick={() => setHeatmapMode(m => m === 'temp' ? 'humidity' : 'temp')}
                    className="rounded-md bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-300 capitalize"
                  >
                    Mode: {heatmapMode}
                  </button>
                </div>
                <MovementSketch positions={positions} gotoCoords={gotoCoords} heatmapMode={heatmapMode} />
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App