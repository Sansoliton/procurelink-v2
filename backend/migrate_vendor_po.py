import sqlite3

conn = sqlite3.connect('procurelink.db')
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE quotations ADD COLUMN line_breakdown TEXT DEFAULT '[]'")
    print('Added line_breakdown to quotations')
except Exception as e:
    print(f'quotations.line_breakdown: {e}')

try:
    cur.execute('''
        CREATE TABLE IF NOT EXISTS vendor_purchase_orders (
            id TEXT PRIMARY KEY,
            org_id TEXT NOT NULL REFERENCES organisations(id),
            quotation_id TEXT NOT NULL REFERENCES quotations(id),
            vendor_id TEXT NOT NULL REFERENCES vendors(id),
            vendor_name TEXT NOT NULL,
            reference TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'raised',
            amount REAL NOT NULL DEFAULT 0.0,
            lines TEXT NOT NULL DEFAULT '[]',
            raised_at DATETIME NOT NULL
        )
    ''')
    print('Created vendor_purchase_orders table')
except Exception as e:
    print(f'vendor_purchase_orders: {e}')

conn.commit()
conn.close()
print('Migration complete')
