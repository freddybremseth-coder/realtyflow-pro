-- Expand publishing book roles so books can be used strategically, not just as sales products.

ALTER TABLE publishing_books DROP CONSTRAINT IF EXISTS publishing_books_role_check;

ALTER TABLE publishing_books
  ADD CONSTRAINT publishing_books_role_check
  CHECK (role IN (
    'front_product',
    'support',
    'next_launch',
    'lead_magnet',
    'authority_book',
    'secondary',
    'parked'
  ));
