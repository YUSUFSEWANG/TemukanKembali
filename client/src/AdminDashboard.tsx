import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, ClipboardList, Clock3, KeyRound, LayoutDashboard, MapPin, PackageCheck, QrCode, ShieldCheck, X } from 'lucide-react'
import QRCode from 'qrcode'
import './AdminDashboard.css'

type User = { name: string; role: string; organization: { name: string; slug: string } }
type Report = { id: number; type: string; category: string; title: string; location: string; status: string; created_at: string; private_details: string; reporter_name?: string; item_code?: string; current_location?: string }
type Claim = { id: number; reportId: number; proofDescription: string; contact: string; status: string; claimantName: string; claimantEmail: string; itemTitle: string }
type Match = { id: number; score: number; lostTitle: string; lostCategory: string; lostLocation: string; foundTitle: string; foundCategory: string; foundLocation: string }
type Movement = { fromLocation: string | null; toLocation: string; handledBy: string | null; notes: string; createdAt: string }
type Overview = { reports: Record<string, number>; claims: Record<string, number>; recentReports: Report[] }

const statusNames: Record<string, string> = { pending: 'Menunggu', published: 'Ditampilkan', claimed: 'Diklaim', resolved: 'Dikembalikan', rejected: 'Ditolak', expired: 'Kedaluwarsa', evidence_requested: 'Butuh bukti', approved: 'Disetujui' }

export default function AdminDashboard({ user, onBack }: { user: User; onBack: () => void }) {
  const [tab, setTab] = useState<'overview' | 'reports' | 'matches' | 'claims'>('overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState('')
  const [handoverId, setHandoverId] = useState<number | null>(null)
  const [trackingReport, setTrackingReport] = useState<Report | null>(null)
  const [qrImage, setQrImage] = useState('')
  const [movements, setMovements] = useState<Movement[]>([])

  async function loadData() {
    try {
      const responses = await Promise.all([
        fetch('/api/admin/overview', { credentials: 'include' }),
        fetch('/api/admin/reports', { credentials: 'include' }),
        fetch('/api/admin/claims', { credentials: 'include' }),
        fetch('/api/admin/matches', { credentials: 'include' }),
      ])
      const results = await Promise.all(responses.map((response) => response.json()))
      const failedIndex = responses.findIndex((response) => !response.ok)
      if (failedIndex !== -1) throw new Error(results[failedIndex].error ?? 'Data dashboard tidak dapat dimuat.')
      setOverview(results[0])
      setReports(results[1].reports)
      setClaims(results[2].claims)
      setMatches(results[3].matches)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Data dashboard tidak dapat dimuat.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function updateStatus(url: string, status: string) {
    const response = await fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? 'Status tidak berhasil diperbarui.'); return }
    await loadData()
  }

  async function submitHandover(event: React.FormEvent<HTMLFormElement>, claimId: number) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const response = await fetch('/api/admin/handovers', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId, receivedBy: data.get('receivedBy'), notes: data.get('notes') }) })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? 'Pengembalian belum tercatat.'); return }
    setHandoverId(null)
    await loadData()
  }

  async function updateMatch(matchId: number, status: 'confirmed' | 'dismissed') {
    const response = await fetch(`/api/admin/matches/${matchId}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? 'Kecocokan belum diperbarui.'); return }
    await loadData()
  }

  async function openTracking(report: Report) {
    setTrackingReport(report)
    setQrImage('')
    setMovements([])
    setError('')
    try {
      const itemUrl = new URL(`/items/${report.id}`, window.location.origin)
      itemUrl.searchParams.set('org', user.organization.slug)
      setQrImage(await QRCode.toDataURL(itemUrl.toString(), { width: 240, margin: 1, color: { dark: '#183e32', light: '#ffffff' } }))
      const response = await fetch(`/api/admin/reports/${report.id}/movements`, { credentials: 'include' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Riwayat perpindahan tidak dapat dimuat.')
      setMovements(result.movements)
    } catch (trackingError) {
      setError(trackingError instanceof Error ? trackingError.message : 'QR barang tidak dapat dibuat.')
    }
  }

  async function moveTrackedItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trackingReport) return
    const data = new FormData(event.currentTarget)
    const response = await fetch(`/api/admin/reports/${trackingReport.id}/movements`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: data.get('location'), notes: data.get('notes') }) })
    const result = await response.json()
    if (!response.ok) { setError(result.error ?? 'Perpindahan belum tercatat.'); return }
    setTrackingReport({ ...trackingReport, current_location: result.location })
    await loadData()
    const historyResponse = await fetch(`/api/admin/reports/${trackingReport.id}/movements`, { credentials: 'include' })
    if (historyResponse.ok) setMovements((await historyResponse.json()).movements)
  }

  const pendingReports = reports.filter((report) => report.status === 'pending').length
  const pendingClaims = claims.filter((claim) => claim.status === 'pending' || claim.status === 'evidence_requested').length

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <a className="brand admin-brand" href="#dashboard"><span className="brand-mark"><KeyRound size={19} /></span><span>temu<span className="brand-light">balik</span><small>PENGELOLA</small></span></a>
      <div className="admin-org"><span className="admin-org-mark">{user.organization.name.slice(0, 1)}</span><span><strong>{user.organization.name}</strong><small>Organisasi aktif</small></span></div>
      <div className="admin-nav-label">RUANG KERJA</div>
      <nav className="admin-nav" aria-label="Menu dashboard">
        <button className={tab === 'overview' ? 'active' : ''} type="button" onClick={() => setTab('overview')}><LayoutDashboard size={17} />Ringkasan</button>
        <button className={tab === 'reports' ? 'active' : ''} type="button" onClick={() => setTab('reports')}><ClipboardList size={17} />Laporan{pendingReports > 0 && <span>{pendingReports}</span>}</button>
        <button className={tab === 'matches' ? 'active' : ''} type="button" onClick={() => setTab('matches')}><ArrowLeftRight size={17} />Pencocokan{matches.length > 0 && <span>{matches.length}</span>}</button>
        <button className={tab === 'claims' ? 'active' : ''} type="button" onClick={() => setTab('claims')}><ShieldCheck size={17} />Klaim{pendingClaims > 0 && <span>{pendingClaims}</span>}</button>
      </nav>
      <button className="admin-back" type="button" onClick={onBack}><ArrowLeft size={16} />Kembali ke portal</button>
      <div className="admin-profile"><span className="profile-avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.role.replace('_', ' ')}</small></span><PackageCheck size={17} /></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><div className="eyebrow">PENGELOLAAN KAMPUS</div><h1>{tab === 'overview' ? 'Ringkasan' : tab === 'reports' ? 'Laporan barang' : tab === 'matches' ? 'Pencocokan laporan' : 'Pengajuan klaim'}</h1></div><button className="admin-mobile-back" type="button" onClick={onBack}><ArrowLeft size={16} />Portal</button></header>
      {error && <div className="admin-error" role="alert"><span>{error}</span><button type="button" aria-label="Tutup pesan" onClick={() => setError('')}><X size={16} /></button></div>}
      {!overview && !error ? <div className="admin-loading"><span />Memuat data...</div> : null}
      {tab === 'overview' && overview && <>
        <div className="admin-welcome"><div><strong>Halo, {user.name.split(' ')[0]}.</strong><span>Berikut aktivitas terbaru barang hilang dan temuan.</span></div><span className="welcome-icon"><Clock3 size={22} /></span></div>
        <section className="stat-grid" aria-label="Statistik laporan"><article><span>Total laporan</span><strong>{Object.values(overview.reports).reduce((sum, count) => sum + count, 0)}</strong><small>Semua status</small></article><article><span>Menunggu ditinjau</span><strong>{pendingReports}</strong><small>Laporan baru masuk</small></article><article><span>Klaim menunggu</span><strong>{pendingClaims}</strong><small>Perlu verifikasi</small></article><article><span>Sudah kembali</span><strong>{overview.reports.resolved ?? 0}</strong><small>Barang diserahkan</small></article></section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><h2>Aktivitas laporan</h2><p>Barang yang terakhir dilaporkan ke institusi.</p></div><button type="button" onClick={() => setTab('reports')}>Semua laporan <ArrowRight size={15} /></button></div><ReportTable reports={overview.recentReports} onReview={() => setTab('reports')} /></section>
        <section className="analytics-panel"><div><span>Barang ditemukan</span><strong>{(overview.reports.published ?? 0) + (overview.reports.claimed ?? 0) + (overview.reports.resolved ?? 0)}</strong></div><div className="analytics-track"><i style={{ width: `${Math.min(100, (overview.reports.resolved ?? 0) * 12)}%` }} /></div><div className="analytics-note"><span>{overview.reports.resolved ?? 0} kembali ke pemilik</span><span>{overview.reports.published ?? 0} menunggu klaim</span></div></section>
      </>}
      {tab === 'reports' && <section className="admin-panel full-panel"><div className="admin-panel-heading"><div><h2>Semua laporan</h2><p>Informasi verifikasi hanya tersedia untuk petugas.</p></div></div><ReportTable reports={reports} onStatus={updateStatus} onTrack={openTracking} /></section>}
      {tab === 'matches' && <section className="match-list"><div className="admin-panel-heading"><div><h2>Kandidat yang mungkin cocok</h2><p>Skor dihitung dari kategori, lokasi, tanggal, dan kesamaan ciri.</p></div></div>{matches.length === 0 ? <div className="admin-empty"><ArrowLeftRight size={25} /><strong>Belum ada kandidat kecocokan.</strong><span>Kandidat baru muncul setelah laporan hilang dan temuan ditinjau.</span></div> : matches.map((match) => <article className="match-card" key={match.id}><div className="match-score"><strong>{match.score}%</strong><span>kecocokan</span></div><div className="match-pair"><div><span>HILANG</span><strong>{match.lostTitle}</strong><small>{match.lostCategory} · {match.lostLocation}</small></div><ArrowLeftRight size={19} /><div><span>DITEMUKAN</span><strong>{match.foundTitle}</strong><small>{match.foundCategory} · {match.foundLocation}</small></div></div><div className="match-actions"><button className="admin-secondary" type="button" onClick={() => void updateMatch(match.id, 'dismissed')}>Bukan kecocokan</button><button className="admin-primary" type="button" onClick={() => void updateMatch(match.id, 'confirmed')}>Konfirmasi cocok <Check size={15} /></button></div></article>)}</section>}
      {tab === 'claims' && <section className="claim-list">{claims.length === 0 ? <div className="admin-empty"><ShieldCheck size={25} /><strong>Belum ada pengajuan klaim.</strong><span>Klaim baru akan muncul di sini untuk diverifikasi.</span></div> : claims.map((claim) => <article className="claim-card" key={claim.id}><div className="claim-card-heading"><div><span className="claim-item-label">KLAIM BARANG</span><h2>{claim.itemTitle}</h2></div><span className={`status-pill status-${claim.status}`}>{statusNames[claim.status] ?? claim.status}</span></div><div className="claim-person"><span className="profile-avatar">{claim.claimantName.slice(0, 1)}</span><span><strong>{claim.claimantName}</strong><small>{claim.claimantEmail}</small></span></div><div className="claim-proof"><span>Bukti kepemilikan</span><p>{claim.proofDescription}</p><small>Kontak: {claim.contact}</small></div>{claim.status === 'approved' ? handoverId === claim.id ? <form className="handover-form" onSubmit={(event) => void submitHandover(event, claim.id)}><label>Barang diterima oleh<input name="receivedBy" defaultValue={claim.claimantName} required /></label><label>Catatan<input name="notes" placeholder="Opsional" /></label><button className="admin-primary" type="submit">Catat pengembalian <Check size={15} /></button></form> : <button className="admin-primary" type="button" onClick={() => setHandoverId(claim.id)}>Catat barang dikembalikan <PackageCheck size={15} /></button> : claim.status !== 'rejected' && <div className="claim-actions"><button className="admin-secondary" type="button" onClick={() => void updateStatus(`/api/admin/claims/${claim.id}/status`, 'rejected')}>Tolak</button><button className="admin-secondary" type="button" onClick={() => void updateStatus(`/api/admin/claims/${claim.id}/status`, 'evidence_requested')}>Minta bukti tambahan</button><button className="admin-primary" type="button" onClick={() => void updateStatus(`/api/admin/claims/${claim.id}/status`, 'approved')}>Setujui klaim <Check size={15} /></button></div>}</article>)}</section>}
    </main>
    {trackingReport && <div className="tracking-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTrackingReport(null) }}><section className="tracking-dialog" role="dialog" aria-modal="true" aria-labelledby="tracking-title"><button className="dialog-close" type="button" aria-label="Tutup" onClick={() => setTrackingReport(null)}><X size={20} /></button><div className="eyebrow">QR TRACKING BARANG</div><h2 id="tracking-title">{trackingReport.title}</h2><p className="tracking-code">Kode barang <strong>{trackingReport.item_code}</strong></p><div className="tracking-qr">{qrImage ? <img src={qrImage} alt={`Kode QR untuk ${trackingReport.title}`} /> : <span>Membuat QR...</span>}</div><a className="tracking-download" href={qrImage} download={`temubalik-${trackingReport.item_code}.png`}><QrCode size={16} />Unduh QR</a><a className="tracking-public-link" href={`/items/${trackingReport.id}?org=${encodeURIComponent(user.organization.slug)}`} target="_blank" rel="noreferrer">Buka halaman publik <ArrowRight size={14} /></a><div className="tracking-current"><MapPin size={15} />Lokasi sekarang: <strong>{trackingReport.current_location ?? trackingReport.location}</strong></div><form className="tracking-move-form" onSubmit={(event) => void moveTrackedItem(event)}><label>Catat perpindahan<input name="location" placeholder="Lokasi baru" required /></label><label>Catatan petugas<input name="notes" placeholder="Opsional" /></label><button className="admin-primary" type="submit">Simpan lokasi <Check size={14} /></button></form><section className="tracking-history"><h3>Riwayat penanganan</h3>{movements.length === 0 ? <p>Belum ada riwayat perpindahan.</p> : movements.map((movement) => <article key={`${movement.createdAt}-${movement.toLocation}`}><span><strong>{movement.toLocation}</strong><small>{movement.fromLocation ? `Dari ${movement.fromLocation}` : 'Lokasi awal'} · {movement.handledBy ?? 'Petugas'}</small>{movement.notes && <small>{movement.notes}</small>}</span><time>{new Date(movement.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time></article>)}</section></section></div>}
  </div>
}

function ReportTable({ reports, onStatus, onReview, onTrack }: { reports: Report[]; onStatus?: (url: string, status: string) => Promise<void>; onReview?: () => void; onTrack?: (report: Report) => void }) {
  if (reports.length === 0) return <div className="admin-empty"><ClipboardList size={24} /><strong>Belum ada laporan.</strong><span>Laporan barang dari institusi akan muncul di sini.</span></div>
  return <div className="report-list">{reports.map((report) => <article className="report-row" key={report.id}><span className={`report-type report-${report.type}`}>{report.type === 'lost' ? 'Hilang' : 'Temuan'}</span><div className="report-info"><strong>{report.title}</strong><span>{report.category} <i /> <MapPin size={13} /> {report.location}</span>{report.private_details && <small>Detail privat: {report.private_details}</small>}</div><span className={`status-pill status-${report.status}`}>{statusNames[report.status] ?? report.status}</span>{report.type === 'found' && report.status !== 'pending' && report.status !== 'rejected' && report.status !== 'expired' && onTrack && <button className="report-qr" type="button" title="Lihat QR dan riwayat" aria-label={`QR dan riwayat ${report.title}`} onClick={() => void onTrack(report)}><QrCode size={16} /></button>}{report.status === 'pending' && onStatus ? <div className="report-actions"><button type="button" title="Tolak laporan" aria-label="Tolak laporan" onClick={() => void onStatus(`/api/admin/reports/${report.id}/status`, 'rejected')}><X size={16} /></button><button className="approve-icon" type="button" title="Tampilkan di katalog" aria-label="Tampilkan di katalog" onClick={() => void onStatus(`/api/admin/reports/${report.id}/status`, 'published')}><Check size={16} /></button></div> : onReview ? <button className="report-review" type="button" onClick={onReview}><ArrowRight size={16} /></button> : <span className="report-spacer" />}</article>)}</div>
}