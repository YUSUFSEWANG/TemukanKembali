import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const sampleItems = [
  ['Dompet kulit hitam', 'Aksesori', 'Perpustakaan pusat', 'Hari ini, 10.42', 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=85'],
  ['Kunci dengan gantungan biru', 'Aksesori', 'Gedung Fakultas A, lantai 2', 'Hari ini, 09.15', 'https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=900&q=85'],
  ['Headphone nirkabel', 'Elektronik', 'Kantin selatan', 'Kemarin, 16.30', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85'],
  ['Tumbler warna sage', 'Lainnya', 'Ruang kuliah B-204', 'Kemarin, 13.08', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'],
]

export function runInTransaction(db, callback) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function createDatabase(databasePath = process.env.DATABASE_PATH ?? './data/temubalik.sqlite') {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath)
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true })

  const db = new DatabaseSync(resolvedPath)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS organization_members (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'organization_admin', 'staff', 'user')),
      UNIQUE (organization_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS item_reports (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('lost', 'found')),
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      public_description TEXT NOT NULL DEFAULT '',
      private_details TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'matched', 'claimed', 'resolved', 'rejected', 'expired')),
      image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS item_reports_public_idx ON item_reports(organization_id, type, status, created_at);
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      report_id INTEGER NOT NULL REFERENCES item_reports(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      proof_description TEXT NOT NULL,
      contact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'evidence_requested', 'approved', 'rejected')),
      verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS claims_org_idx ON claims(organization_id, status, created_at);
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      lost_report_id INTEGER NOT NULL REFERENCES item_reports(id) ON DELETE CASCADE,
      found_report_id INTEGER NOT NULL REFERENCES item_reports(id) ON DELETE CASCADE,
      match_score INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'dismissed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organization_id, lost_report_id, found_report_id)
    );
    CREATE TABLE IF NOT EXISTS handover_records (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      report_id INTEGER NOT NULL REFERENCES item_reports(id) ON DELETE CASCADE,
      claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      staff_id INTEGER NOT NULL REFERENCES users(id),
      received_by TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      handover_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  runInTransaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO organizations (name, slug) VALUES (?, ?)').run('Kampus Demo', 'kampus-demo')
    const organization = db.prepare('SELECT id FROM organizations WHERE slug = ?').get('kampus-demo')
    if (db.prepare('SELECT COUNT(*) AS count FROM item_reports WHERE organization_id = ?').get(organization.id).count === 0) {
      const insert = db.prepare(`INSERT INTO item_reports (organization_id, type, category, title, location, event_date, status, image_url)
        VALUES (?, 'found', ?, ?, ?, ?, 'published', ?)`)
      for (const [title, category, location, eventDate, imageUrl] of sampleItems) insert.run(organization.id, category, title, location, eventDate, imageUrl)
    }
  })
  return db
}