import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import multer from 'multer'
import { z } from 'zod'
import { runInTransaction } from './database.js'

const sessionCookie = 'temubalik_session'
const sessionDuration = 7 * 24 * 60 * 60 * 1000
const allowedRoles = ['super_admin', 'organization_admin', 'staff']
const passwordSchema = z.string().min(10).max(128)
const ignoredWords = new Set(['yang', 'dan', 'atau', 'dengan', 'untuk', 'dari', 'pada', 'saya', 'milik', 'barang', 'ada', 'ini', 'itu'])
const uploadsDirectory = resolve(process.env.UPLOADS_DIRECTORY ?? './uploads')
const imageExtensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
mkdirSync(uploadsDirectory, { recursive: true })

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDirectory,
    filename: (_request, file, callback) => callback(null, `${randomUUID()}.${imageExtensions[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = Boolean(imageExtensions[file.mimetype])
    callback(allowed ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname), allowed)
  },
})

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expected] = storedHash.split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = scryptSync(password, salt, 64)
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer)
}

function cookieValue(request) {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))
  return cookie ? decodeURIComponent(cookie.slice(sessionCookie.length + 1)) : null
}

function setSessionCookie(response, token, maxAge = sessionDuration) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}`)
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`)
}

function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}

function publicReport(row) {
  return { id: row.id, type: row.type, category: row.category, title: row.title, description: row.public_description, location: row.location, eventDate: row.event_date, status: row.status, imageUrl: row.image_url, createdAt: row.created_at }
}

function userView(row) {
  return { id: row.user_id, name: row.name, email: row.email, organization: { id: row.organization_id, name: row.organization_name, slug: row.organization_slug }, role: row.role }
}

function itemWords(report) {
  return new Set(`${report.title} ${report.public_description} ${report.private_details}`.toLocaleLowerCase('id').match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 2 && !ignoredWords.has(word)) ?? [])
}

function calculateMatchScore(lost, found) {
  let score = lost.category.toLocaleLowerCase('id') === found.category.toLocaleLowerCase('id') ? 40 : 0
  const lostLocation = new Set(lost.location.toLocaleLowerCase('id').match(/[\p{L}\p{N}]+/gu) ?? [])
  const foundLocation = new Set(found.location.toLocaleLowerCase('id').match(/[\p{L}\p{N}]+/gu) ?? [])
  const locationOverlap = [...lostLocation].filter((word) => foundLocation.has(word)).length
  if (lost.location.toLocaleLowerCase('id') === found.location.toLocaleLowerCase('id')) score += 30
  else if (locationOverlap > 0) score += 20
  const lostWords = itemWords(lost)
  const foundWords = itemWords(found)
  const sharedWords = [...lostWords].filter((word) => foundWords.has(word))
  if (sharedWords.length) score += Math.min(20, sharedWords.length * 10)
  const lostDate = Date.parse(lost.event_date)
  const foundDate = Date.parse(found.event_date)
  if (Number.isFinite(lostDate) && Number.isFinite(foundDate) && Math.abs(lostDate - foundDate) <= 7 * 24 * 60 * 60 * 1000) score += 10
  return Math.min(score, 100)
}

export function createApp(db) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '100kb' }))
  app.use('/uploads', express.static(uploadsDirectory, { maxAge: '1h', setHeaders: (response) => response.setHeader('X-Content-Type-Options', 'nosniff') }))

  app.use((request, _response, next) => {
    const token = cookieValue(request)
    if (token) {
      const hash = createHash('sha256').update(token).digest('hex')
      const row = db.prepare(`SELECT s.token_hash, s.expires_at, u.id AS user_id, u.name, u.email,
          o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug, m.role
        FROM sessions s JOIN users u ON u.id = s.user_id
        JOIN organizations o ON o.id = s.organization_id
        JOIN organization_members m ON m.organization_id = o.id AND m.user_id = u.id
        WHERE s.token_hash = ?`).get(hash)
      if (row && row.expires_at > Date.now()) request.auth = { session: row, view: userView(row) }
      else if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash)
    }
    next()
  })

  function requireAuth(request, response, next) {
    if (!request.auth) return response.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' })
    next()
  }

  function requireStaff(request, response, next) {
    if (!request.auth) return response.status(401).json({ error: 'Silakan masuk untuk melanjutkan.' })
    if (!allowedRoles.includes(request.auth.view.role)) return response.status(403).json({ error: 'Akses khusus pengelola.' })
    next()
  }

  function organizationId(request) {
    const slug = request.auth?.view.organization.slug ?? String(request.get('x-organization-slug') ?? 'kampus-demo').trim().slice(0, 60)
    return db.prepare('SELECT id FROM organizations WHERE slug = ?').get(slug)?.id
  }

  function logAction(request, action, entityType, entityId) {
    db.prepare('INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
      .run(request.auth.view.organization.id, request.auth.view.id, action, entityType, entityId)
  }

  function createSession(response, member) {
    const token = randomBytes(32).toString('base64url')
    db.prepare('INSERT INTO sessions (token_hash, organization_id, user_id, expires_at) VALUES (?, ?, ?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), member.organization_id, member.user_id, Date.now() + sessionDuration)
    setSessionCookie(response, token)
  }

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

  app.get('/api/auth/me', (request, response) => response.json({ user: request.auth?.view ?? null }))

  app.post('/api/auth/register', (request, response) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: passwordSchema, organizationName: z.string().trim().min(2).max(120) }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Periksa kembali nama, email, kata sandi minimal 10 karakter, dan nama institusi.' })

    const { name, password, organizationName } = parsed.data
    const email = parsed.data.email.toLowerCase()
    const baseSlug = slugify(organizationName)
    if (!baseSlug) return response.status(400).json({ error: 'Nama institusi tidak valid.' })
    const slug = baseSlug
    try {
      const member = runInTransaction(db, () => {
        const existingOrganization = db.prepare('SELECT id, name FROM organizations WHERE slug = ?').get(slug)
        const organization = existingOrganization
          ? { lastInsertRowid: existingOrganization.id, name: existingOrganization.name }
          : { ...db.prepare('INSERT INTO organizations (name, slug) VALUES (?, ?)').run(organizationName, slug), name: organizationName }
        const role = existingOrganization ? 'user' : 'organization_admin'
        const user = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hashPassword(password))
        db.prepare('INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, ?)').run(organization.lastInsertRowid, user.lastInsertRowid, role)
        return { organization_id: Number(organization.lastInsertRowid), organization_name: organization.name, organization_slug: slug, user_id: Number(user.lastInsertRowid), name, email, role }
      })
      createSession(response, member)
      return response.status(201).json({ user: userView(member) })
    } catch (error) {
      if (String(error.message).includes('users.email')) return response.status(409).json({ error: 'Email ini sudah digunakan.' })
      throw error
    }
  })

  app.post('/api/auth/login', (request, response) => {
    const parsed = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128), organizationSlug: z.string().trim().min(1).max(60).optional().default('kampus-demo') }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Email, kata sandi, atau institusi tidak valid.' })
    const email = parsed.data.email.toLowerCase()
    const member = db.prepare(`SELECT u.id AS user_id, u.name, u.email, u.password_hash, m.role,
        o.id AS organization_id, o.name AS organization_name, o.slug AS organization_slug
      FROM users u JOIN organization_members m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.organization_id
      WHERE u.email = ? AND o.slug = ?`).get(email, parsed.data.organizationSlug)
    if (!member || !verifyPassword(parsed.data.password, member.password_hash)) return response.status(401).json({ error: 'Email atau kata sandi tidak cocok.' })
    createSession(response, member)
    return response.json({ user: userView(member) })
  })

  app.post('/api/auth/logout', (request, response) => {
    const token = cookieValue(request)
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(createHash('sha256').update(token).digest('hex'))
    clearSessionCookie(response)
    response.status(204).end()
  })

  app.get('/api/items', (request, response) => {
    const orgId = organizationId(request)
    if (!orgId) return response.json({ items: [] })
    const query = String(request.query.q ?? '').trim().slice(0, 100)
    const category = String(request.query.category ?? '').trim().slice(0, 60)
    const rows = db.prepare(`SELECT * FROM item_reports WHERE organization_id = ? AND type = 'found' AND status IN ('published', 'matched')
      AND (? = '' OR category = ?) AND (? = '' OR title LIKE ? OR location LIKE ? OR category LIKE ?)
      ORDER BY created_at DESC, id DESC`).all(orgId, category, category, query, `%${query}%`, `%${query}%`, `%${query}%`)
    response.json({ items: rows.map(publicReport) })
  })

  app.post('/api/reports', requireAuth, imageUpload.single('photo'), (request, response) => {
    const parsed = z.object({ type: z.enum(['lost', 'found']), category: z.string().trim().min(2).max(60), title: z.string().trim().min(2).max(120), description: z.string().trim().max(500).optional().default(''), privateDetails: z.string().trim().max(1000).optional().default(''), eventDate: z.string().max(40).optional().default(''), location: z.string().trim().min(2).max(160), imageUrl: z.string().url().max(1000).optional().default('') }).safeParse(request.body)
    if (!parsed.success) {
      if (request.file) unlinkSync(request.file.path)
      return response.status(400).json({ error: 'Lengkapi nama barang, kategori, dan lokasi dengan benar.' })
    }
    const report = parsed.data
    const status = report.type === 'found' ? 'pending' : 'published'
    const result = db.prepare(`INSERT INTO item_reports (organization_id, user_id, type, category, title, public_description, private_details, event_date, location, status, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(request.auth.view.organization.id, request.auth.view.id, report.type, report.category, report.title, report.description, report.privateDetails, report.eventDate, report.location, status, request.file ? `/uploads/${request.file.filename}` : report.imageUrl)
    logAction(request, 'report.created', 'item_report', Number(result.lastInsertRowid))
    response.status(201).json({ report: db.prepare('SELECT * FROM item_reports WHERE id = ? AND organization_id = ?').get(result.lastInsertRowid, request.auth.view.organization.id) })
  })

  app.get('/api/reports/mine', requireAuth, (request, response) => {
    const organization = request.auth.view.organization.id
    const reports = db.prepare('SELECT * FROM item_reports WHERE organization_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC').all(organization, request.auth.view.id)
    const claims = db.prepare(`SELECT c.id, c.report_id AS reportId, c.proof_description AS proofDescription, c.status, c.created_at AS createdAt, r.title AS itemTitle
      FROM claims c JOIN item_reports r ON r.id = c.report_id AND r.organization_id = c.organization_id
      WHERE c.organization_id = ? AND c.user_id = ? ORDER BY c.created_at DESC`).all(organization, request.auth.view.id)
    response.json({ reports, claims })
  })

  app.post('/api/claims', requireAuth, (request, response) => {
    const parsed = z.object({ reportId: z.coerce.number().int().positive(), proofDescription: z.string().trim().min(8).max(1000), contact: z.string().trim().min(5).max(80) }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Tambahkan bukti kepemilikan dan nomor yang bisa dihubungi.' })
    const orgId = request.auth.view.organization.id
    const report = db.prepare("SELECT id, user_id FROM item_reports WHERE id = ? AND organization_id = ? AND type = 'found' AND status IN ('published', 'matched')").get(parsed.data.reportId, orgId)
    if (!report) return response.status(404).json({ error: 'Barang tidak tersedia untuk diklaim.' })
    if (report.user_id === request.auth.view.id) return response.status(400).json({ error: 'Kamu tidak dapat mengklaim laporanmu sendiri.' })
    const existing = db.prepare("SELECT id FROM claims WHERE report_id = ? AND user_id = ? AND status IN ('pending', 'evidence_requested', 'approved')").get(report.id, request.auth.view.id)
    if (existing) return response.status(409).json({ error: 'Kamu sudah mengajukan klaim untuk barang ini.' })
    const result = db.prepare('INSERT INTO claims (organization_id, report_id, user_id, proof_description, contact) VALUES (?, ?, ?, ?, ?)').run(orgId, report.id, request.auth.view.id, parsed.data.proofDescription, parsed.data.contact)
    logAction(request, 'claim.submitted', 'claim', Number(result.lastInsertRowid))
    response.status(201).json({ claim: { id: Number(result.lastInsertRowid), reportId: report.id, status: 'pending' } })
  })

  app.get('/api/admin/overview', requireStaff, (request, response) => {
    const orgId = request.auth.view.organization.id
    const reports = db.prepare('SELECT status, COUNT(*) AS count FROM item_reports WHERE organization_id = ? GROUP BY status').all(orgId)
    const claims = db.prepare('SELECT status, COUNT(*) AS count FROM claims WHERE organization_id = ? GROUP BY status').all(orgId)
    const total = (list) => Object.fromEntries(list.map((row) => [row.status, row.count]))
    response.json({ reports: total(reports), claims: total(claims), recentReports: db.prepare('SELECT id, type, category, title, location, status, created_at AS createdAt FROM item_reports WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 8').all(orgId) })
  })

  app.get('/api/admin/reports', requireStaff, (request, response) => {
    const orgId = request.auth.view.organization.id
    const status = String(request.query.status ?? '')
    const reports = db.prepare(`SELECT r.*, u.name AS reporter_name FROM item_reports r LEFT JOIN users u ON u.id = r.user_id
      WHERE r.organization_id = ? AND (? = '' OR r.status = ?) ORDER BY r.created_at DESC, r.id DESC`).all(orgId, status, status)
    response.json({ reports })
  })

  app.patch('/api/admin/reports/:id/status', requireStaff, (request, response) => {
    const parsed = z.object({ status: z.enum(['published', 'rejected', 'expired']) }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Status laporan tidak valid.' })
    const orgId = request.auth.view.organization.id
    const current = db.prepare('SELECT status FROM item_reports WHERE id = ? AND organization_id = ?').get(request.params.id, orgId)
    if (!current) return response.status(404).json({ error: 'Laporan tidak ditemukan di organisasi ini.' })
    const allowedTransitions = { pending: ['published', 'rejected'], published: ['rejected', 'expired'] }
    if (!allowedTransitions[current.status]?.includes(parsed.data.status)) return response.status(409).json({ error: 'Perubahan status ini tidak tersedia pada tahap laporan sekarang.' })
    const result = db.prepare('UPDATE item_reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?').run(parsed.data.status, request.params.id, orgId)
    if (!result.changes) return response.status(409).json({ error: 'Status laporan tidak berubah.' })
    logAction(request, `report.${parsed.data.status}`, 'item_report', Number(request.params.id))
    response.json({ status: parsed.data.status })
  })

  app.get('/api/admin/matches', requireStaff, (request, response) => {
    const orgId = request.auth.view.organization.id
    const lostReports = db.prepare("SELECT * FROM item_reports WHERE organization_id = ? AND type = 'lost' AND status IN ('published', 'matched')").all(orgId)
    const foundReports = db.prepare("SELECT * FROM item_reports WHERE organization_id = ? AND type = 'found' AND status IN ('published', 'matched')").all(orgId)
    const saveMatch = db.prepare(`INSERT INTO matches (organization_id, lost_report_id, found_report_id, match_score)
      VALUES (?, ?, ?, ?) ON CONFLICT (organization_id, lost_report_id, found_report_id)
      DO UPDATE SET match_score = excluded.match_score WHERE matches.status = 'suggested'`)
    for (const lost of lostReports) {
      for (const found of foundReports) {
        const score = calculateMatchScore(lost, found)
        if (score >= 40) saveMatch.run(orgId, lost.id, found.id, score)
      }
    }
    const matches = db.prepare(`SELECT m.id, m.match_score AS score, m.status, m.created_at AS createdAt,
        lost.title AS lostTitle, lost.category AS lostCategory, lost.location AS lostLocation,
        found.title AS foundTitle, found.category AS foundCategory, found.location AS foundLocation
      FROM matches m JOIN item_reports lost ON lost.id = m.lost_report_id AND lost.organization_id = m.organization_id
      JOIN item_reports found ON found.id = m.found_report_id AND found.organization_id = m.organization_id
      WHERE m.organization_id = ? AND m.status = 'suggested' ORDER BY m.match_score DESC, m.created_at DESC`).all(orgId)
    response.json({ matches })
  })

  app.patch('/api/admin/matches/:id', requireStaff, (request, response) => {
    const parsed = z.object({ status: z.enum(['confirmed', 'dismissed']) }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Status kecocokan tidak valid.' })
    const orgId = request.auth.view.organization.id
    const update = runInTransaction(db, () => {
      const match = db.prepare('SELECT lost_report_id, found_report_id FROM matches WHERE id = ? AND organization_id = ? AND status = ?').get(request.params.id, orgId, 'suggested')
      if (!match) return false
      db.prepare('UPDATE matches SET status = ? WHERE id = ? AND organization_id = ?').run(parsed.data.status, request.params.id, orgId)
      if (parsed.data.status === 'confirmed') db.prepare("UPDATE item_reports SET status = 'matched', updated_at = CURRENT_TIMESTAMP WHERE id IN (?, ?) AND organization_id = ?").run(match.lost_report_id, match.found_report_id, orgId)
      logAction(request, `match.${parsed.data.status}`, 'match', Number(request.params.id))
      return true
    })
    if (!update) return response.status(404).json({ error: 'Kandidat kecocokan tidak ditemukan.' })
    response.json({ status: parsed.data.status })
  })

  app.get('/api/admin/claims', requireStaff, (request, response) => {
    const claims = db.prepare(`SELECT c.id, c.report_id AS reportId, c.proof_description AS proofDescription, c.contact, c.status, c.created_at AS createdAt,
        u.name AS claimantName, u.email AS claimantEmail, r.title AS itemTitle
      FROM claims c JOIN users u ON u.id = c.user_id
      JOIN item_reports r ON r.id = c.report_id AND r.organization_id = c.organization_id
      WHERE c.organization_id = ? ORDER BY c.created_at DESC`).all(request.auth.view.organization.id)
    response.json({ claims })
  })

  app.patch('/api/admin/claims/:id/status', requireStaff, (request, response) => {
    const parsed = z.object({ status: z.enum(['evidence_requested', 'approved', 'rejected']) }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Status klaim tidak valid.' })
    const orgId = request.auth.view.organization.id
    const claim = db.prepare('SELECT id, report_id FROM claims WHERE id = ? AND organization_id = ?').get(request.params.id, orgId)
    if (!claim) return response.status(404).json({ error: 'Klaim tidak ditemukan di organisasi ini.' })
    const currentClaim = db.prepare('SELECT status FROM claims WHERE id = ? AND organization_id = ?').get(claim.id, orgId)
    if (!['pending', 'evidence_requested'].includes(currentClaim.status)) return response.status(409).json({ error: 'Klaim ini sudah diputuskan.' })
    if (parsed.data.status === 'approved') {
      const existing = db.prepare("SELECT id FROM claims WHERE report_id = ? AND status = 'approved' AND id != ?").get(claim.report_id, claim.id)
      if (existing) return response.status(409).json({ error: 'Klaim lain untuk barang ini sudah disetujui.' })
    }
    runInTransaction(db, () => {
      db.prepare('UPDATE claims SET status = ?, verified_by = ? WHERE id = ? AND organization_id = ?').run(parsed.data.status, request.auth.view.id, claim.id, orgId)
      if (parsed.data.status === 'approved') db.prepare("UPDATE item_reports SET status = 'claimed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?").run(claim.report_id, orgId)
      if (parsed.data.status === 'rejected' || parsed.data.status === 'evidence_requested') db.prepare("UPDATE item_reports SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ? AND status = 'claimed'").run(claim.report_id, orgId)
      logAction(request, `claim.${parsed.data.status}`, 'claim', claim.id)
    })
    response.json({ status: parsed.data.status })
  })

  app.post('/api/admin/handovers', requireStaff, (request, response) => {
    const parsed = z.object({ claimId: z.coerce.number().int().positive(), receivedBy: z.string().trim().min(2).max(120), notes: z.string().trim().max(500).optional().default('') }).safeParse(request.body)
    if (!parsed.success) return response.status(400).json({ error: 'Nama penerima pengembalian wajib diisi.' })
    const orgId = request.auth.view.organization.id
    const claim = db.prepare("SELECT id, report_id FROM claims WHERE id = ? AND organization_id = ? AND status = 'approved'").get(parsed.data.claimId, orgId)
    if (!claim) return response.status(404).json({ error: 'Klaim yang disetujui tidak ditemukan.' })
    const record = runInTransaction(db, () => {
      const result = db.prepare('INSERT INTO handover_records (organization_id, report_id, claim_id, staff_id, received_by, notes) VALUES (?, ?, ?, ?, ?, ?)').run(orgId, claim.report_id, claim.id, request.auth.view.id, parsed.data.receivedBy, parsed.data.notes)
      db.prepare("UPDATE item_reports SET status = 'resolved', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND organization_id = ?").run(claim.report_id, orgId)
      logAction(request, 'item.handed_over', 'handover', Number(result.lastInsertRowid))
      return Number(result.lastInsertRowid)
    })
    response.status(201).json({ handoverId: record })
  })

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return response.status(400).json({ error: 'Ukuran foto maksimal 5 MB.' })
    if (error instanceof multer.MulterError) return response.status(400).json({ error: 'Unggah satu foto JPG, PNG, atau WebP.' })
    console.error(error)
    response.status(500).json({ error: 'Terjadi kesalahan pada server.' })
  })

  return app
}