import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, KeyRound, MapPin, PackageCheck, ShieldCheck } from 'lucide-react'
import './TrackedItem.css'

type Movement = { location: string; createdAt: string }
type TrackedItemData = {
  id: number
  title: string
  category: string
  description: string
  eventDate: string
  location: string
  itemCode: string
  status: 'stored' | 'claimed' | 'returned'
  imageUrl: string
  movements: Movement[]
}

const statusLabels = { stored: 'Tersimpan, menunggu pemilik', claimed: 'Klaim sedang diverifikasi', returned: 'Sudah kembali ke pemilik' }

export default function TrackedItem({ reportId }: { reportId: number }) {
  const organizationSlug = new URLSearchParams(window.location.search).get('org') ?? 'kampus-demo'
  const [item, setItem] = useState<TrackedItemData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadItem() {
      try {
        const response = await fetch(`/api/items/${reportId}`, { headers: { 'x-organization-slug': organizationSlug } })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Barang tidak dapat ditemukan.')
        if (active) setItem(result.item)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Barang tidak dapat ditemukan.')
      }
    }
    void loadItem()
    return () => { active = false }
  }, [organizationSlug, reportId])

  return <div className="tracked-shell">
    <header className="tracked-header"><a className="brand" href={`/?org=${encodeURIComponent(organizationSlug)}`}><span className="brand-mark"><KeyRound size={19} /></span><span>temu<span className="brand-light">balik</span></span></a><a href={`/?org=${encodeURIComponent(organizationSlug)}`}><ArrowLeft size={15} />Kembali ke katalog</a></header>
    <main className="tracked-main">
      {error ? <section className="tracked-empty"><PackageCheck size={30} /><h1>Barang tidak ditemukan</h1><p>{error}</p><a href={`/?org=${encodeURIComponent(organizationSlug)}`}>Kembali ke katalog <ArrowRight size={15} /></a></section> : !item ? <div className="tracked-loading">Memuat informasi barang...</div> : <>
        <div className="tracked-kicker"><span />BARANG TEMUAN · {item.itemCode}</div>
        <section className="tracked-detail"><div className="tracked-image-wrap">{item.imageUrl ? <img src={item.imageUrl} alt={`Foto ${item.title}`} /> : <div className="tracked-image-placeholder"><PackageCheck size={38} /></div>}<span className={`tracked-status status-${item.status}`}><span />{statusLabels[item.status]}</span></div><div className="tracked-copy"><div className="eyebrow">{item.category.toLocaleUpperCase('id')}</div><h1>{item.title}</h1>{item.description && <p className="tracked-description">{item.description}</p>}<div className="tracked-meta"><span><MapPin size={16} />{item.location}</span><span><Clock3 size={16} />{item.eventDate || 'Tanggal belum dicatat'}</span></div>{item.status === 'stored' ? <a className="tracked-claim" href={`/?claim=${item.id}&org=${encodeURIComponent(organizationSlug)}`}>Ini barang saya <ArrowRight size={16} /></a> : <div className="tracked-safe"><ShieldCheck size={17} />{item.status === 'claimed' ? 'Petugas sedang memeriksa bukti pemilik.' : 'Barang sudah diserahkan kepada pemiliknya.'}</div>}</div></section>
        <section className="tracked-history"><div><div className="eyebrow">PERJALANAN BARANG</div><h2>Riwayat lokasi</h2></div><ol>{item.movements.map((movement, index) => <li key={`${movement.createdAt}-${movement.location}`}><span className={index === item.movements.length - 1 ? 'history-dot current' : 'history-dot'} /><div><strong>{movement.location}</strong><time>{new Date(movement.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</time></div></li>)}</ol><p className="tracked-privacy"><ShieldCheck size={14} />Riwayat ini tidak menampilkan identitas petugas maupun detail pribadi.</p></section>
      </>}
    </main>
    <footer className="tracked-footer"><span>TemuBalik · Barang hilang dan temuan kampus</span><span>Informasi pemilik dijaga kerahasiaannya.</span></footer>
  </div>
}