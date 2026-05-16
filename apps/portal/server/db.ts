import Database from 'better-sqlite3';

export const db = new Database('./portal.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    beneficiary_id_raw TEXT NOT NULL,
    scheme TEXT NOT NULL,
    member_id TEXT NOT NULL,
    wallet TEXT NOT NULL,
    owner_member_id TEXT NOT NULL,
    adopted INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL
  );
`);

export interface ActivityRow {
  id: number;
  ts: string;
  beneficiary_id_raw: string;
  scheme: string;
  member_id: string;
  wallet: string;
  owner_member_id: string;
  adopted: number;
  amount: number;
}

const insertStmt = db.prepare<[string, string, string, string, string, number, number]>(
  `INSERT INTO activity (beneficiary_id_raw, scheme, member_id, wallet, owner_member_id, adopted, amount)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

const listStmt = db.prepare(
  `SELECT * FROM activity ORDER BY ts DESC LIMIT 200`,
);

export function logActivity(row: Omit<ActivityRow, 'id' | 'ts'>): void {
  insertStmt.run(
    row.beneficiary_id_raw,
    row.scheme,
    row.member_id,
    row.wallet,
    row.owner_member_id,
    row.adopted,
    row.amount,
  );
}

export function listActivity(): ActivityRow[] {
  return listStmt.all() as ActivityRow[];
}
