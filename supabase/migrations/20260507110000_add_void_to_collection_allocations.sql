ALTER TABLE public.collection_allocations
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'voided')),
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN voided_reason text;

CREATE INDEX collection_allocations_status_idx
  ON public.collection_allocations (status)
  WHERE status = 'active';

