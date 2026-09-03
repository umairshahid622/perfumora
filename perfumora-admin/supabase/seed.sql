-- ============================================================================
-- Perfumora Admin — seed data
--
-- Run AFTER schema.sql, in: Supabase Dashboard → SQL Editor.
-- This is the design-phase sample catalog (12 of your ~25 SKUs) plus 10 recent
-- orders, so the panel has something to show on first load. Re-runnable:
-- conflicting ids are updated rather than duplicated.
--
-- Delete this file (and the rows) once your real catalog is in.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- fragrances
-- ---------------------------------------------------------------------------

insert into fragrances (id, name, image_url, color, description, active) values
  ('frag_001', 'Midnight Oud',     '/images/midnight-oud.jpg',     '#2E2A24', 'Deep, smoky, warm.',              true),
  ('frag_002', 'White Musk',       '/images/white-musk.jpg',       '#e7e0d5', 'Clean, soft, powdery.',           true),
  ('frag_004', 'Rose Taif',        '/images/rose-taif.jpg',        '#8c3b4a', 'Bright rose, dewy petals.',       true),
  ('frag_005', 'Citrus Bloom',     '/images/citrus-bloom.jpg',     '#d8a13a', 'Zesty bergamot and neroli.',      true),
  ('frag_007', 'Sandalwood Dusk',  '/images/sandalwood-dusk.jpg',  '#a56a3f', 'Creamy sandalwood, dry cedar.',   true),
  ('frag_009', 'Amber Noir',       '/images/amber-noir.jpg',       '#3b2f2f', 'Resinous amber, dark vanilla.',   true),
  ('frag_012', 'Vetiver Green',    '/images/vetiver-green.jpg',    '#3f5e3a', 'Earthy vetiver, crushed leaves.', true),
  ('frag_014', 'Jasmine Veil',     '/images/jasmine-veil.jpg',     '#eae3c9', 'Heady jasmine, white florals.',   true),
  ('frag_016', 'Leather Bound',    '/images/leather-bound.jpg',    '#5a3d2b', 'Supple leather, smoked tea.',      false),
  ('frag_018', 'Sea Salt & Sage',  '/images/sea-salt-sage.jpg',    '#7f9aa6', 'Cool salt air, green sage.',       true),
  ('frag_021', 'Fig & Cedar',      '/images/fig-cedar.jpg',        '#6b6244', 'Milky fig, warm cedarwood.',      true),
  ('frag_023', 'Saffron Ember',    '/images/saffron-ember.jpg',    '#a8452a', 'Spiced saffron, glowing amber.',   false)
on conflict (id) do update set
  name        = excluded.name,
  image_url   = excluded.image_url,
  color       = excluded.color,
  description = excluded.description,
  active      = excluded.active;

-- ---------------------------------------------------------------------------
-- fragrance_sizes — price (whole PKR) + stock per size.
--
-- A row here means "we sell this size". Most fragrances list both; Citrus Bloom
-- is 30ml only and Amber Noir is 50ml only, so each has a single row — that's
-- how a single-size fragrance is represented, not a second row priced 0.
--
-- Stock values reproduce the low-stock alerts the dashboard was designed
-- against (Amber Noir 50ml = 1, Midnight Oud 50ml = 2, etc).
-- ---------------------------------------------------------------------------

-- Re-runnable: clear the seeded fragrances' size rows first, so a size dropped
-- from the list below doesn't linger from an earlier run of this file.
delete from fragrance_sizes
where fragrance_id in (
  'frag_001', 'frag_002', 'frag_004', 'frag_005', 'frag_007', 'frag_009',
  'frag_012', 'frag_014', 'frag_016', 'frag_018', 'frag_021', 'frag_023'
);

insert into fragrance_sizes (fragrance_id, size, price, stock) values
  ('frag_001', '30ml', 2500,  4), ('frag_001', '50ml', 3800,  2),
  ('frag_002', '30ml', 2200,  9), ('frag_002', '50ml', 3500,  6),
  ('frag_004', '30ml', 2900,  3), ('frag_004', '50ml', 4100,  5),
  ('frag_005', '30ml', 2300, 12),                                  -- 30ml only
  ('frag_007', '30ml', 2600,  7), ('frag_007', '50ml', 3900,  4),
                                  ('frag_009', '50ml', 4200,  1),  -- 50ml only
  ('frag_012', '30ml', 2400,  2), ('frag_012', '50ml', 3600,  6),
  ('frag_014', '30ml', 2700, 10), ('frag_014', '50ml', 3800,  7),
  ('frag_016', '30ml', 3100,  0), ('frag_016', '50ml', 4400,  0),
  ('frag_018', '30ml', 2500, 14), ('frag_018', '50ml', 3700,  9),
  ('frag_021', '30ml', 2600,  3), ('frag_021', '50ml', 3900, 11),
  ('frag_023', '30ml', 3200,  6), ('frag_023', '50ml', 4600,  2)
on conflict (fragrance_id, size) do update set
  price = excluded.price,
  stock = excluded.stock;

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------

insert into orders (id, customer_name, customer_email, customer_phone, shipping_address, status, total, created_at) values
  ('order_1043', 'Ahmed Raza',      'ahmed.raza@gmail.com',    '+92 300 1234567', 'House 12, Street 4, DHA Phase 5, Lahore',       'pending',    3800,  '2026-09-02T09:12:00Z'),
  ('order_1042', 'Sara Khan',       'sara.khan@outlook.com',   '+92 321 9876543', 'Flat 3B, Clifton Block 2, Karachi',            'pending',   10000,  '2026-09-02T07:40:00Z'),
  ('order_1041', 'Bilal Ahmed',     'bilal.a@gmail.com',       '+92 333 4567890', '22-C, Gulberg III, Lahore',                    'processing', 3500,  '2026-09-01T14:05:00Z'),
  ('order_1040', 'Hina Tariq',      'hina.tariq@gmail.com',    '+92 345 1112223', 'House 88, F-10/2, Islamabad',                  'processing', 5000,  '2026-09-01T11:30:00Z'),
  ('order_1039', 'Usman Malik',     'usman.malik@yahoo.com',   '+92 300 7778889', 'Plot 45, Bahria Town Phase 7, Rawalpindi',     'delivered',  2500,  '2026-09-01T08:15:00Z'),
  ('order_1038', 'Ayesha Siddiqui', 'ayesha.s@gmail.com',      '+92 321 3334445', 'House 5, Model Town Block B, Lahore',          'delivered',  8400,  '2026-08-31T16:50:00Z'),
  ('order_1037', 'Fahad Iqbal',     'fahad.iqbal@gmail.com',   '+92 333 6667778', '27-B, Askari 10, Lahore',                      'delivered',  2300,  '2026-08-30T13:20:00Z'),
  ('order_1036', 'Mariam Yousaf',   'mariam.y@outlook.com',    '+92 345 8889990', 'House 19, PECHS Block 6, Karachi',             'canceled',   4100,  '2026-08-29T10:00:00Z'),
  ('order_1035', 'Zain Abbas',      'zain.abbas@gmail.com',    '+92 300 2223334', 'House 61, Wapda Town, Lahore',                 'delivered',  6300,  '2026-08-28T15:10:00Z'),
  ('order_1034', 'Nida Aslam',      'nida.aslam@outlook.com',  '+92 321 5556667', 'Flat 7, Gulshan-e-Iqbal Block 5, Karachi',     'delivered',  3900,  '2026-08-27T12:00:00Z')
on conflict (id) do update set
  customer_name    = excluded.customer_name,
  customer_email   = excluded.customer_email,
  customer_phone   = excluded.customer_phone,
  shipping_address = excluded.shipping_address,
  status           = excluded.status,
  total            = excluded.total,
  created_at       = excluded.created_at;

-- ---------------------------------------------------------------------------
-- order_items — `id` is auto-generated, so clear any prior seed lines first to
-- keep this file re-runnable without piling up duplicates.
-- ---------------------------------------------------------------------------

delete from order_items where order_id in (
  'order_1034','order_1035','order_1036','order_1037','order_1038',
  'order_1039','order_1040','order_1041','order_1042','order_1043'
);

insert into order_items (order_id, fragrance_id, fragrance_name, size, qty, price) values
  ('order_1043', 'frag_001', 'Midnight Oud',    '50ml', 1, 3800),
  ('order_1042', 'frag_004', 'Rose Taif',       '30ml', 2, 2900),
  ('order_1042', 'frag_009', 'Amber Noir',      '50ml', 1, 4200),
  ('order_1041', 'frag_002', 'White Musk',      '50ml', 1, 3500),
  ('order_1040', 'frag_007', 'Sandalwood Dusk', '30ml', 1, 2600),
  ('order_1040', 'frag_012', 'Vetiver Green',   '30ml', 1, 2400),
  ('order_1039', 'frag_001', 'Midnight Oud',    '30ml', 1, 2500),
  ('order_1038', 'frag_009', 'Amber Noir',      '50ml', 2, 4200),
  ('order_1037', 'frag_005', 'Citrus Bloom',    '30ml', 1, 2300),
  ('order_1036', 'frag_004', 'Rose Taif',       '50ml', 1, 4100),
  ('order_1035', 'frag_014', 'Jasmine Veil',    '50ml', 1, 3800),
  ('order_1035', 'frag_018', 'Sea Salt & Sage', '30ml', 1, 2500),
  ('order_1034', 'frag_021', 'Fig & Cedar',     '50ml', 1, 3900);



