-- Supabase Seed Data for MeelieFont Digital Library
-- Contains essential roles and system settings (dummy books and members removed for clean slate)

-- 1. Essential Roles
INSERT INTO public.roles (name, description) VALUES
('Administrator', 'Full system access and configuration control'),
('Librarian', 'Catalog and inventory management'),
('Member', 'Browse the public catalog')
ON CONFLICT (name) DO NOTHING;

-- 2. Initial Settings
INSERT INTO public.settings (setting_key, setting_value) VALUES
('library_info', '{"name": "MeelieFont Library", "code": "RDW-01", "address": "452 Bookkeeper Way, Alexandria, VA", "phone": "+1 (555) 234-5678", "email": "", "currency": "$"}'::jsonb),
('inventory_config', '{"code_prefix": "RDW", "barcode_format": "CODE128", "default_shelf": "Main Floor", "default_rack": "A-01"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
