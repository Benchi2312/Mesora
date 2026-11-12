export default function SuperAdminCarga({ recurso }: { recurso: string }) {
  return (
    <section className="sa-loading" role="status" aria-live="polite" aria-busy="true">
      <p className="sa-loading-label">Cargando {recurso}…</p>
      <div className="sa-loading-grid" aria-hidden="true">
        <span className="sa-loading-card" />
        <span className="sa-loading-card" />
        <span className="sa-loading-card" />
      </div>
      <div className="sa-loading-lines" aria-hidden="true">
        <span className="sa-loading-line" />
        <span className="sa-loading-line" />
        <span className="sa-loading-line" />
      </div>
    </section>
  )
}
