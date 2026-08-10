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
