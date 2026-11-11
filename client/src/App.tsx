import { useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Clock3, KeyRound, MapPin, Menu, Search, ShieldCheck, Upload, X } from 'lucide-react'
import './App.css'

type Item = { id: number; name: string; category: string; location: string; date: string; image: string; imageAlt: string }
type Dialog = 'lost' | 'found' | 'claim' | 'login' | null

const initialItems: Item[] = [
  { id: 1, name: 'Dompet kulit hitam', category: 'Aksesori', location: 'Perpustakaan pusat', date: 'Hari ini, 10.42', image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=85', imageAlt: 'Dompet kulit gelap di atas permukaan kayu' },
  { id: 2, name: 'Kunci dengan gantungan biru', category: 'Aksesori', location: 'Gedung Fakultas A, lantai 2', date: 'Hari ini, 09.15', image: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=900&q=85', imageAlt: 'Seikat kunci dengan gantungan warna-warni' },
  { id: 3, name: 'Headphone nirkabel', category: 'Elektronik', location: 'Kantin selatan', date: 'Kemarin, 16.30', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85', imageAlt: 'Headphone di atas meja dengan latar hangat' },
  { id: 4, name: 'Tumbler warna sage', category: 'Lainnya', location: 'Ruang kuliah B-204', date: 'Kemarin, 13.08', image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85', imageAlt: 'Botol minum stainless steel' },
]
const categories = ['Semua barang', 'Elektronik', 'Aksesori', 'Dokumen', 'Lainnya']

function App() {
  const [items, setItems] = useState(initialItems)
  const [activeCategory, setActiveCategory] = useState('Semua barang')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id')
    return items.filter((item) => (activeCategory === 'Semua barang' || item.category === activeCategory) && (!query || `${item.name} ${item.location} ${item.category}`.toLocaleLowerCase('id').includes(query)))
  }, [activeCategory, items, search])

  function openDialog(nextDialog: Dialog, item?: Item) {
    setSubmitted(false)
    setSelectedItem(item ?? null)
    setDialog(nextDialog)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (dialog === 'found') {
      const name = String(data.get('name') ?? '').trim()
      const location = String(data.get('location') ?? '').trim()
      if (name && location) setItems((current) => [{ id: Date.now(), name, location, category: String(data.get('category') ?? 'Lainnya'), date: 'Baru saja', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85', imageAlt: `Foto ilustrasi barang ${name}` }, ...current])
    }
    setSubmitted(true)
  }

  return <div className="site-shell">
    <header className="site-header">
      <a className="brand" href="#beranda" aria-label="TemuBalik, beranda"><span className="brand-mark"><KeyRound size={20} /></span><span>temu<span className="brand-light">balik</span><small>PORTAL KAMPUS</small></span></a>
      <nav className="main-nav" aria-label="Navigasi utama"><a className="nav-active" href="#barang">Cari barang</a><a href="#cara-kerja">Cara kerja</a><a href="#bantuan">Pusat bantuan</a></nav>
      <div className="header-actions"><button className="login-button" type="button" onClick={() => openDialog('login')}>Masuk</button><button className="report-button" type="button" onClick={() => openDialog('lost')}>Buat laporan <ArrowRight size={16} /></button></div>
      <button className="mobile-menu" type="button" aria-label="Buka menu" onClick={() => openDialog('login')}><Menu size={22} /></button>
    </header>

    <main>
      <section className="hero" id="beranda">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot" />RUANG TEMU BARANG KAMPUS</div><h1>Yang hilang,<br />semoga segera <em>pulang.</em></h1><p className="hero-description">Temukan barangmu kembali, atau bantu seseorang menemukan miliknya. Semua berawal dari sini.</p>
          <form className="search-box" onSubmit={(event) => { event.preventDefault(); document.getElementById('barang')?.scrollIntoView({ behavior: 'smooth' }) }}><Search size={20} /><input aria-label="Cari barang atau lokasi" placeholder="Cari barang, lokasi, atau kata kunci..." value={search} onChange={(event) => setSearch(event.target.value)} /><button type="submit" aria-label="Cari"><ArrowRight size={19} /></button></form>
          <div className="hero-footnote"><ShieldCheck size={16} />Data pribadi dan detail barangmu tetap aman.</div>
        </div>
        <div className="hero-visual"><img src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1400&q=90" alt="Tas punggung yang ditemukan di area kampus" /><div className="image-note"><span className="image-note-icon"><MapPin size={16} /></span><span><strong>Setiap barang punya cerita.</strong><small>Dan kesempatan untuk kembali.</small></span></div><div className="hero-stamp"><span>Temu</span><span>kembali</span><small>SEJAK HARI INI</small></div></div>
      </section>

      <section className="quick-actions" aria-label="Buat laporan">
        <button className="quick-action lost-action" type="button" onClick={() => openDialog('lost')}><span className="action-icon"><Search size={19} /></span><span className="action-copy"><strong>Kehilangan sesuatu?</strong><small>Laporkan barang yang sedang kamu cari</small></span><ArrowRight className="action-arrow" size={19} /></button>
        <button className="quick-action found-action" type="button" onClick={() => openDialog('found')}><span className="action-icon"><KeyRound size={19} /></span><span className="action-copy"><strong>Menemukan barang?</strong><small>Bantu pemiliknya menemukan jalan pulang</small></span><ArrowRight className="action-arrow" size={19} /></button>
      </section>

      <section className="items-section" id="barang">
        <div className="section-heading"><div><div className="eyebrow section-eyebrow">BARANG TEMUAN</div><h2>Mungkin ini milikmu.</h2><p>Barang yang baru saja ditemukan di sekitar kampus.</p></div><a className="text-link" href="#semua-barang">Lihat semua <ArrowRight size={16} /></a></div>
        <div className="catalog-toolbar"><div className="category-tabs" role="tablist" aria-label="Filter kategori barang">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category-tab active' : 'category-tab'} type="button" role="tab" aria-selected={activeCategory === category} onClick={() => setActiveCategory(category)}>{category}</button>)}</div><button className="sort-button" type="button" onClick={() => setActiveCategory('Semua barang')}>Terbaru <ChevronDown size={16} /></button></div>
        <div className="items-grid">{filteredItems.map((item) => <article className="item-card" key={item.id}><button className="item-image-button" type="button" onClick={() => openDialog('claim', item)} aria-label={`Ajukan klaim untuk ${item.name}`}><img className="item-image" src={item.image} alt={item.imageAlt} loading="lazy" /><span className="found-label"><span /> DITEMUKAN</span><span className="item-open"><ArrowRight size={18} /></span></button><div className="item-details"><div className="item-category">{item.category}</div><h3>{item.name}</h3><div className="item-meta"><span><MapPin size={14} />{item.location}</span><span><Clock3 size={14} />{item.date}</span></div><button className="claim-link" type="button" onClick={() => openDialog('claim', item)}>Ini barang saya <ArrowRight size={15} /></button></div></article>)}{filteredItems.length === 0 && <div className="empty-state"><Search size={24} /><strong>Belum ada barang yang cocok.</strong><span>Coba kata kunci atau kategori lain.</span></div>}</div>
        <div className="catalog-footer" id="semua-barang"><span>Menampilkan <strong>{filteredItems.length}</strong> barang temuan</span><button type="button" onClick={() => { setActiveCategory('Semua barang'); setSearch('') }}>Lihat semua barang <ArrowRight size={16} /></button></div>
      </section>

      <section className="trust-strip" id="cara-kerja"><div className="trust-icon"><ShieldCheck size={24} /></div><div><strong>Barang kembali, dengan cara yang aman.</strong><span>Identitas pemilik diverifikasi sebelum barang diserahkan. Detail pribadi tidak pernah ditampilkan untuk umum.</span></div><a href="#bantuan">Pelajari prosesnya <ArrowRight size={15} /></a></section>
    </main>
    <footer className="site-footer" id="bantuan"><a className="brand footer-brand" href="#beranda"><span className="brand-mark"><KeyRound size={18} /></span><span>temu<span className="brand-light">balik</span></span></a><span>Portal barang hilang dan temuan · Kampus</span><a href="mailto:bantuan@temubalik.id">Butuh bantuan? <ArrowRight size={14} /></a></footer>

    {dialog && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="dialog-close" type="button" aria-label="Tutup" onClick={() => setDialog(null)}><X size={20} /></button>
      {submitted ? <div className="success-state"><span className="success-icon"><Check size={24} /></span><div className="eyebrow">LAPORAN DITERIMA</div><h2 id="dialog-title">Terima kasih sudah membantu.</h2><p>{dialog === 'claim' ? 'Tim pengelola akan memeriksa bukti kepemilikanmu sebelum menghubungi.' : 'Laporanmu sudah dicatat. Tim pengelola akan meninjau informasi ini.'}</p><button className="dialog-primary" type="button" onClick={() => setDialog(null)}>Selesai <ArrowRight size={16} /></button></div> : <>
        <div className="dialog-kicker">{dialog === 'lost' ? 'BARANG HILANG' : dialog === 'found' ? 'BARANG TEMUAN' : dialog === 'claim' ? 'VERIFIKASI PEMILIK' : 'PORTAL KAMPUS'}</div><h2 id="dialog-title">{dialog === 'lost' ? 'Ceritakan barang yang hilang.' : dialog === 'found' ? 'Apa yang kamu temukan?' : dialog === 'claim' ? `Apakah ini ${selectedItem?.name.toLocaleLowerCase('id')} milikmu?` : 'Selamat datang kembali.'}</h2><p className="dialog-description">{dialog === 'claim' ? 'Sebutkan ciri khusus yang tidak ditampilkan di halaman publik agar petugas dapat memverifikasi.' : dialog === 'login' ? 'Masuk menggunakan akun institusi untuk memantau laporan dan klaimmu.' : 'Informasi detail hanya dapat dilihat oleh pengelola untuk menjaga privasi.'}</p>
        <form className="dialog-form" onSubmit={handleSubmit}>{dialog === 'login' ? <><label>Email institusi<input type="email" name="email" placeholder="nama@kampus.ac.id" required /></label><label>Kata sandi<input type="password" name="password" placeholder="Masukkan kata sandi" required /></label><button className="dialog-primary" type="submit">Masuk <ArrowRight size={16} /></button></> : dialog === 'claim' ? <><label>Detail yang membuktikan kepemilikan<textarea name="proof" placeholder="Contoh: isi dompet, ciri khusus, atau benda di dalamnya..." rows={4} required /></label><label>Nomor yang bisa dihubungi<input type="tel" name="contact" placeholder="08xx xxxx xxxx" required /></label><button className="dialog-primary" type="submit">Kirim pengajuan <ArrowRight size={16} /></button></> : <><label>Nama barang<input name="name" placeholder="Contoh: Dompet kulit hitam" required /></label><div className="form-row"><label>Kategori<select name="category" defaultValue="Elektronik"><option>Elektronik</option><option>Aksesori</option><option>Dokumen</option><option>Lainnya</option></select></label><label>Lokasi<input name="location" placeholder="Gedung atau area" required /></label></div><label>Deskripsi dan ciri khusus<textarea name="description" placeholder="Warna, ciri khusus, atau detail lain..." rows={3} /></label><label className="upload-field"><Upload size={17} /> Tambahkan foto <input type="file" name="photo" accept="image/*" /></label><button className="dialog-primary" type="submit">Kirim laporan <ArrowRight size={16} /></button></>}</form>
        <div className="dialog-privacy"><ShieldCheck size={15} />Informasi pribadi hanya dapat dilihat oleh pengelola.</div>
      </>}</section></div>}
  </div>
}

export default App
