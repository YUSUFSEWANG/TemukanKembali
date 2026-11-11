import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, KeyRound, MapPin, ShieldCheck } from 'lucide-react'
import './MyReports.css'

type User = { name: string; organization: { name: string } }
type Report = { id: number; type: string; title: string; category: string; location: string; status: string; created_at: string }
type Claim = { id: number; itemTitle: string; proofDescription: string; status: string; createdAt: string }
type Activity = { reports: Report[]; claims: Claim[] }
const labels: Record<string, string> = { pending: 'Menunggu ditinjau', published: 'Ditampilkan', claimed: 'Sedang diklaim', resolved: 'Selesai', rejected: 'Ditolak', expired: 'Kedaluwarsa', evidence_requested: 'Butuh bukti tambahan', approved: 'Disetujui' }

export default function MyReports({ user, onBack }: { user: User; onBack: () => void }) {
  const [activity, setActivity] = useState<Activity>({ reports: [], claims: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadActivity() {
      try {
        const response = await fetch('/api/reports/mine', { credentials: 'include' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Aktivitas tidak dapat dimuat.')
        if (active) setActivity(result)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Aktivitas tidak dapat dimuat.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadActivity()
    return () => { active = false }
  }, [])

  return <div className="my-reports-shell">
    <header className="my-reports-header"><a className="brand" href="#portal"><span className="brand-mark"><KeyRound size={19} /></span><span>temu<span className="brand-light">balik</span></span></a><button type="button" onClick={onBack}><ArrowLeft size={16} />Kembali ke portal</button></header>
    <main className="my-reports-main"><div className="eyebrow">RUANG PRIBADI · {user.organization.name.toLocaleUpperCase('id')}</div><h1>Laporan & klaim saya</h1><p className="my-reports-intro">Pantau laporan dan proses pengembalian barangmu.</p>{error && <div className="my-reports-error" role="alert">{error}</div>}{loading ? <div className="my-reports-empty">Memuat aktivitas...</div> : <div className="my-reports-grid">
      <section className="my-activity-section"><div className="my-activity-heading"><div><h2>Laporan barang</h2><p>{activity.reports.length} laporan</p></div><ShieldCheck size={19} /></div>{activity.reports.length === 0 ? <div className="my-reports-empty">Belum ada laporan dari akunmu.</div> : activity.reports.map((report) => <article className="my-activity-row" key={`report-${report.id}`}><span className={`activity-kind activity-${report.type}`}>{report.type === 'lost' ? 'Hilang' : 'Temuan'}</span><div><strong>{report.title}</strong><span>{report.category} · <MapPin size={12} />{report.location}</span></div><span className={`activity-status activity-${report.status}`}>{labels[report.status] ?? report.status}</span><small><Clock3 size={12} />{new Date(report.created_at).toLocaleDateString('id-ID')}</small></article>)}</section>
      <section className="my-activity-section"><div className="my-activity-heading"><div><h2>Pengajuan klaim</h2><p>{activity.claims.length} pengajuan</p></div><KeyRound size={19} /></div>{activity.claims.length === 0 ? <div className="my-reports-empty">Belum ada klaim yang diajukan.</div> : activity.claims.map((claim) => <article className="my-claim-row" key={`claim-${claim.id}`}><div className="my-claim-title"><strong>{claim.itemTitle}</strong><span className={`activity-status activity-${claim.status}`}>{labels[claim.status] ?? claim.status}</span></div><p>{claim.proofDescription}</p><small><Clock3 size={12} />Diajukan {new Date(claim.createdAt).toLocaleDateString('id-ID')}</small></article>)}</section>
    </div>}<button className="my-report-cta" type="button" onClick={onBack}>Cari barang temuan <ArrowRight size={16} /></button></main>
  </div>
}