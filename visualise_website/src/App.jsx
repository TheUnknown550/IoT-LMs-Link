import { useEffect, useMemo, useState } from "react";
import MovementSketch from "./MovementSketch";

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
  const [heatmapMode, setHeatmapMode] = useState('temp'); // 'temp' or 'humidity'


  const parsed = useMemo(() => lines.map(parseLine), [lines]);

  const positions = useMemo(() => {
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

    return newPositions;
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
                        className={`inline-flex h-6 min-w-16 items-center justify-center rounded-full px-2 text-xs font-semibold ${levelBg[level] || levelBg.INFO
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