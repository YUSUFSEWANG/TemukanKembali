import assert from 'node:assert/strict'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDatabase } from '../src/database.js'

let db
let app

beforeEach(() => {
  db = createDatabase(':memory:')
  app = createApp(db)
})

afterEach(() => db.close())

async function register(organizationName, email) {
  const response = await request(app).post('/api/auth/register').send({ name: 'Admin Kampus', email, password: 'kata-sandi-demo-aman', organizationName })
  assert.equal(response.status, 201)
  return response
}

test('register creates a tenant admin and an HttpOnly session cookie', async () => {
  const response = await register('Universitas Contoh', 'admin@contoh.ac.id')
  assert.equal(response.body.user.role, 'organization_admin')
  assert.equal(response.body.user.organization.slug, 'universitas-contoh')
  assert.match(response.headers['set-cookie'][0], /HttpOnly/)
  assert.match(response.headers['set-cookie'][0], /SameSite=Lax/)
  assert.equal((await request(app).get('/api/auth/me').set('Cookie', response.headers['set-cookie'])).body.user.organization.slug, 'universitas-contoh')
})

test('later registrations join an existing organization with the user role', async () => {
  await register('Kampus Bersama', 'admin@bersama.ac.id')
  const member = await register('Kampus Bersama', 'mahasiswa@bersama.ac.id')
  assert.equal(member.body.user.role, 'user')
  const access = await request(app).get('/api/admin/overview').set('Cookie', member.headers['set-cookie'])
  assert.equal(access.status, 403)
})

test('public item responses never include private claim details', async () => {
  const organization = db.prepare("SELECT id FROM organizations WHERE slug = 'kampus-demo'").get()
  db.prepare("UPDATE item_reports SET private_details = 'nomor seri rahasia' WHERE organization_id = ?").run(organization.id)
  const response = await request(app).get('/api/items')
  assert.equal(response.status, 200)
  assert.equal(response.body.items.length, 4)
  assert.equal(JSON.stringify(response.body).includes('nomor seri rahasia'), false)
})

test('users and reports are isolated between organizations', async () => {
  const campusA = await register('Kampus Satu', 'admin@satu.ac.id')
  const campusB = await register('Kampus Dua', 'admin@dua.ac.id')
  const created = await request(app).post('/api/reports').set('Cookie', campusA.headers['set-cookie']).send({ type: 'found', category: 'Aksesori', title: 'Kartu akses merah', location: 'Gedung A', privateDetails: 'nomor seri rahasia' })
  assert.equal(created.status, 201)
  const visibleInB = await request(app).get('/api/admin/reports').set('Cookie', campusB.headers['set-cookie'])
  assert.equal(visibleInB.status, 200)
  assert.equal(visibleInB.body.reports.length, 0)
  const foreignUpdate = await request(app).patch(`/api/admin/reports/${created.body.report.id}/status`).set('Cookie', campusB.headers['set-cookie']).send({ status: 'published' })
  assert.equal(foreignUpdate.status, 404)
})

test('a report cannot be marked returned without an approved claim and handover', async () => {
  const admin = await register('Kampus Alur', 'admin@alur.ac.id')
  const report = await request(app).post('/api/reports').set('Cookie', admin.headers['set-cookie']).send({ type: 'found', category: 'Aksesori', title: 'Kartu biru', location: 'Aula' })
  const invalidTransition = await request(app).patch(`/api/admin/reports/${report.body.report.id}/status`).set('Cookie', admin.headers['set-cookie']).send({ status: 'resolved' })
  assert.equal(invalidTransition.status, 400)
  const stillPending = db.prepare('SELECT status FROM item_reports WHERE id = ?').get(report.body.report.id)
  assert.equal(stillPending.status, 'pending')
})

test('public catalog selects only the requested organization', async () => {
  const campusA = await register('Katalog Satu', 'admin@katalog-satu.ac.id')
  const campusB = await register('Katalog Dua', 'admin@katalog-dua.ac.id')
  const report = await request(app).post('/api/reports').set('Cookie', campusA.headers['set-cookie']).send({ type: 'found', category: 'Aksesori', title: 'Payung hijau', location: 'Aula' })
  await request(app).patch(`/api/admin/reports/${report.body.report.id}/status`).set('Cookie', campusA.headers['set-cookie']).send({ status: 'published' }).expect(200)
  const visibleInA = await request(app).get('/api/items').set('x-organization-slug', campusA.body.user.organization.slug)
  const visibleInB = await request(app).get('/api/items').set('x-organization-slug', campusB.body.user.organization.slug)
  assert.equal(visibleInA.body.items.some((item) => item.title === 'Payung hijau'), true)
  assert.equal(visibleInB.body.items.some((item) => item.title === 'Payung hijau'), false)
})

test('report photos are stored and served as image files', async () => {
  const admin = await register('Kampus Foto', 'admin@foto.ac.id')
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXxYAAAAASUVORK5CYII=', 'base64')
  const report = await request(app).post('/api/reports').set('Cookie', admin.headers['set-cookie'])
    .field('type', 'found').field('category', 'Lainnya').field('title', 'Barang dengan foto').field('location', 'Aula')
    .attach('photo', image, { filename: 'barang.png', contentType: 'image/png' })
  assert.equal(report.status, 201)
  assert.match(report.body.report.image_url, /^\/uploads\/[\da-f-]+\.png$/)
  const imagePath = resolve('./uploads', report.body.report.image_url.split('/').pop())
  try {
    const response = await request(app).get(report.body.report.image_url)
    assert.equal(response.status, 200)
    assert.match(response.headers['content-type'], /image\/png/)
  } finally {
    unlinkSync(imagePath)
  }
})

test('regular users can sign in but cannot access organization administration', async () => {
  const admin = await register('Kampus Peran', 'admin@peran.ac.id')
  const organizationId = admin.body.user.organization.id
  db.prepare("UPDATE organization_members SET role = 'user' WHERE organization_id = ? AND user_id = ?").run(organizationId, admin.body.user.id)
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@peran.ac.id', password: 'kata-sandi-demo-aman', organizationSlug: 'kampus-peran' })
  assert.equal(login.status, 200)
  const overview = await request(app).get('/api/admin/overview').set('Cookie', login.headers['set-cookie'])
  assert.equal(overview.status, 403)
})

test('claim verification and handover advance the item through its lifecycle', async () => {
  const admin = await register('Kampus Klaim', 'admin@klaim.ac.id')
  const claimant = await register('Kampus Anggota', 'user@anggota.ac.id')
  const organizationId = admin.body.user.organization.id
  db.prepare("INSERT INTO organization_members (organization_id, user_id, role) VALUES (?, ?, 'user')").run(organizationId, claimant.body.user.id)
  const report = await request(app).post('/api/reports').set('Cookie', admin.headers['set-cookie']).send({ type: 'found', category: 'Aksesori', title: 'Dompet biru', location: 'Perpustakaan' })
  assert.equal(report.status, 201)
  await request(app).patch(`/api/admin/reports/${report.body.report.id}/status`).set('Cookie', admin.headers['set-cookie']).send({ status: 'published' }).expect(200)
  const login = await request(app).post('/api/auth/login').send({ email: 'user@anggota.ac.id', password: 'kata-sandi-demo-aman', organizationSlug: 'kampus-klaim' })
  const claim = await request(app).post('/api/claims').set('Cookie', login.headers['set-cookie']).send({ reportId: report.body.report.id, proofDescription: 'Ada koin kecil di kantong bagian dalam.', contact: '08123456789' })
  assert.equal(claim.status, 201)
  const adminClaims = await request(app).get('/api/admin/claims').set('Cookie', admin.headers['set-cookie'])
  assert.equal(adminClaims.body.claims[0].proofDescription, 'Ada koin kecil di kantong bagian dalam.')
  await request(app).patch(`/api/admin/claims/${claim.body.claim.id}/status`).set('Cookie', admin.headers['set-cookie']).send({ status: 'approved' }).expect(200)
  const handover = await request(app).post('/api/admin/handovers').set('Cookie', admin.headers['set-cookie']).send({ claimId: claim.body.claim.id, receivedBy: 'Pemilik terverifikasi' })
  assert.equal(handover.status, 201)
  assert.equal(db.prepare('SELECT status FROM item_reports WHERE id = ?').get(report.body.report.id).status, 'resolved')
})

test('admin matching ranks similar lost and found reports and confirms the pair', async () => {
  const admin = await register('Kampus Cocok', 'admin@cocok.ac.id')
  const lost = await request(app).post('/api/reports').set('Cookie', admin.headers['set-cookie']).send({ type: 'lost', category: 'Aksesori', title: 'Dompet kulit hitam', location: 'Perpustakaan pusat', eventDate: '2026-11-10' })
  const found = await request(app).post('/api/reports').set('Cookie', admin.headers['set-cookie']).send({ type: 'found', category: 'Aksesori', title: 'Dompet hitam kulit', location: 'Perpustakaan pusat', eventDate: '2026-11-11' })
  await request(app).patch(`/api/admin/reports/${found.body.report.id}/status`).set('Cookie', admin.headers['set-cookie']).send({ status: 'published' }).expect(200)
  const candidates = await request(app).get('/api/admin/matches').set('Cookie', admin.headers['set-cookie'])
  assert.equal(candidates.status, 200)
  assert.equal(candidates.body.matches.length, 1)
  assert.ok(candidates.body.matches[0].score >= 80)
  await request(app).patch(`/api/admin/matches/${candidates.body.matches[0].id}`).set('Cookie', admin.headers['set-cookie']).send({ status: 'confirmed' }).expect(200)
  assert.equal(db.prepare('SELECT status FROM item_reports WHERE id = ?').get(lost.body.report.id).status, 'matched')
  assert.equal(db.prepare('SELECT status FROM item_reports WHERE id = ?').get(found.body.report.id).status, 'matched')
  const publicItems = await request(app).get('/api/items').set('Cookie', admin.headers['set-cookie'])
  assert.equal(publicItems.body.items.some((item) => item.title === 'Dompet hitam kulit'), true)
})