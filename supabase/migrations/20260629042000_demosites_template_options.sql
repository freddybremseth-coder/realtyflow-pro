-- DemoSites template options
-- Aligns the selectable DemoSites templates with the four current HTML demos.

INSERT INTO demo_site_templates (slug, name, category, description, preview_url, repo_url)
VALUES
  (
    'elektro',
    'Pindsle Elektro',
    'trades',
    'Håndverker/elektriker-mal med fastpriser, lokale tjenester og AI-chat for jobbforespørsler.',
    'https://realtyflow.chatgenius.pro/saas/elektro.html',
    'https://github.com/freddybremseth-coder/demosites/blob/main/elektro.html'
  ),
  (
    'dekk',
    'Sandefjord Dekk',
    'auto',
    'Bil, dekk og verksted-mal med timeforespørsel, reg.nr og sesongbaserte tjenester.',
    'https://realtyflow.chatgenius.pro/saas/dekk.html',
    'https://github.com/freddybremseth-coder/demosites/blob/main/dekk.html'
  ),
  (
    'frakt',
    'Vestfold Frakt',
    'transport',
    'Transport/logistikk-mal med fra-til-rute, godstype og tilbudsforespørsel.',
    'https://realtyflow.chatgenius.pro/saas/frakt.html',
    'https://github.com/freddybremseth-coder/demosites/blob/main/frakt.html'
  ),
  (
    'renhold',
    'Sandefjord Renhold',
    'cleaning',
    'Renholdsmal for privat og bedrift med areal, frekvens og enkel prisforespørsel.',
    'https://realtyflow.chatgenius.pro/saas/renhold.html',
    'https://github.com/freddybremseth-coder/demosites/blob/main/renhold.html'
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  preview_url = EXCLUDED.preview_url,
  repo_url = EXCLUDED.repo_url,
  updated_at = NOW();
