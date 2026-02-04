const checks = [
  {
    title: 'Colors & gradients',
    description: 'Backgrounds, borders, and text should all reflect Tailwind palette utilities.',
    swatchClass: 'from-indigo-500 via-sky-500 to-emerald-400',
  },
  {
    title: 'Layout & spacing',
    description: 'Grid, padding, rounded corners, and shadows confirm spacing utilities.',
    swatchClass: 'from-purple-500 via-fuchsia-500 to-orange-400',
  },
  {
    title: 'State styles',
    description: 'Hover the buttons to see transitions and subtle elevation.',
    swatchClass: 'from-emerald-400 via-green-500 to-lime-300',
  },
]

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-5xl space-y-10">
        <header className="text-center space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            Tailwind live check
          </span>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            If you see this styling, Tailwind is running.
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Hot reload should update immediately when you tweak classes. Try editing
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-emerald-200">src/App.jsx</code>
            to verify.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/40">
              Primary button
            </button>
            <button className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80">
              Outline button
            </button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {checks.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-black/30"
            >
              <div
                className={`h-10 w-full rounded-xl bg-gradient-to-r ${item.swatchClass}`}
                aria-hidden="true"
              />
              <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
              <p className="text-sm text-slate-300">{item.description}</p>
            </div>
          ))}
        </div>

        <footer className="text-center text-sm text-slate-400">
          Tip: change the colors or spacing above and save to ensure Vite + Tailwind refresh instantly.
        </footer>
      </div>
    </div>
  )
}

export default App
