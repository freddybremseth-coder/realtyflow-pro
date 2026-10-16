-- CI TEST FIXTURE ONLY. Canonical migration is in Altovena repository.
-- Host-specific initial tenant for embedded development on RealtyflowPRO.
-- This file is intentionally NOT part of a customer standalone installation.
-- Idempotent; leaves all user memberships and actual missions empty.
BEGIN;
INSERT INTO altovena.tenants(name,external_ref,status)
VALUES ('Altovena Internal','host:realtyflowpro:altovena-internal','active')
ON CONFLICT (external_ref) DO NOTHING;
INSERT INTO altovena.tenant_products(tenant_id,product_slug,status,activated_at)
SELECT t.id, 'command', 'active', now()
FROM altovena.tenants t
WHERE t.external_ref = 'host:realtyflowpro:altovena-internal'
ON CONFLICT (tenant_id,product_slug) DO NOTHING;
COMMIT;
