export default function HomePage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">clarifier</h1>
      <p className="mt-4 max-w-2xl text-ink/80">{"Paste a CSV. Columns map to physical properties, not axes. Force-settling separates commingled rows into legible clusters — or says plainly, with a computed number, when it doesn't."}</p>
      <p className="mt-8 text-sm text-amber">Workspace scaffold — the simulation lands in M1.</p>
    </div>
  );
}
