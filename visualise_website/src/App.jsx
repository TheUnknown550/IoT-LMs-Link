import { useEffect, useMemo, useState } from "react"

const FALLBACK_URL = "http://localhost:8100/logs?limit=300"

const levelColors = {
  DEBUG: "text-sky-300",
  INFO: "text-emerald-300",
  WARNING: "text-amber-300",
  ERROR: "text-rose-300",
  CRITICAL: "text-red-400",
}

const levelBg = {
  DEBUG: "bg-sky-500/10 ring-1 ring-sky-500/40",
  INFO: "bg-emerald-500/10 ring-1 ring-emerald-500/40",
  WARNING: "bg-amber-500/10 ring-1 ring-amber-500/40",
  ERROR: "bg-rose-500/10 ring-1 ring-rose-500/40",
  CRITICAL: "bg-red-500/15 ring-1 ring-red-500/40",
}

function parseLine(line) {
  const match = line.match(/^(\S+\s+\S+)\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+(.*)$/)
  if (!match) {
    return { timestamp: "", level: "INFO", message: line }
  }
  return {
    timestamp: match[1],
    level: match[2],
    message: match[3],
  }
}

function useLogs(url, intervalMs = 2500) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchLogs = async () =>
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setLines(data.lines ?? [])
        setError(null)
        setLastUpdated(new Date())
      })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => setLoading(false))

  useEffect(() => {
    fetchLogs()
    const id = setInterval(fetchLogs, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, intervalMs])

  return { lines, loading, error, lastUpdated, refresh: fetchLogs }
}

function App() {
  const url = import.meta.env.VITE_MCP_LOG_URL || FALLBACK_URL
  const { lines, loading, error, lastUpdated, refresh } = useLogs(url)

  const parsed = useMemo(() => lines.map(parseLine), [lines])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            MCP Server Logs
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Live log viewer</h1>
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
      </div>
    </div>
  )
}

export default App
