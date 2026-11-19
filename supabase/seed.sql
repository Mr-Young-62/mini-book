-- Supabase Seed Data for MeelieFont Digital Library
-- Contains essential roles and system settings (dummy books and members removed for clean slate)

-- 1. Essential Roles
INSERT INTO public.roles (name, description) VALUES
('Administrator', 'Full system access and configuration control'),
('Librarian', 'Catalog management'),
('Member', 'Browse the public catalog')
ON CONFLICT (name) DO NOTHING;

-- 2. Initial Settings
INSERT INTO public.settings (setting_key, setting_value) VALUES
('library_info', '{"name": "MeelieFont Library", "code": "RDW-01", "address": "", "phone": "", "email": "", "currency": "IDR"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
