INSERT INTO categories (name, slug) VALUES
  ('Lapka', 'lapka'),
  ('Plastina', 'plastina'),
  ('Nina', 'nina'),
  ('Pichoq', 'pichoq'),
  ('Disk', 'disk'),
  ('Ulitka', 'ulitka'),
  ('Overlock parts', 'overlock-parts'),
  ('Other', 'other')
ON CONFLICT (slug) DO NOTHING;

-- Development credentials: admin@example.com / Admin123!
-- Change this password immediately outside local development.
INSERT INTO users (name, email, password_hash, role)
VALUES (
  'System Admin',
  'admin@example.com',
  crypt('Admin123!', gen_salt('bf', 12)),
  'ADMIN'
)
ON CONFLICT (email) DO NOTHING;

