-- The catalog module's books. Owned by com.example.library.catalog.
CREATE TABLE catalog_book (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  isbn text NOT NULL UNIQUE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
