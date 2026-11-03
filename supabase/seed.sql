-- Supabase Seed Data for Readowl Mini Digital Library
-- Contains essential roles and system settings (dummy books and members removed for clean slate)

-- 1. Essential Roles
INSERT INTO public.roles (name, description) VALUES
('Administrator', 'Full system access and configuration control'),
('Librarian', 'Catalog, borrowing, return, and inventory management'),
('Member', 'Catalog search and personal loan history viewing')
ON CONFLICT (name) DO NOTHING;

-- 2. Initial Settings
INSERT INTO public.settings (setting_key, setting_value) VALUES
('library_info', '{"name": "Readowl Community Library", "code": "RDW-01", "address": "452 Bookkeeper Way, Alexandria, VA", "phone": "+1 (555) 234-5678", "email": "contact@readowl.library", "currency": "$"}'::jsonb),
('circulation_rules', '{"default_loan_days": 14, "max_loans_per_member": 5, "daily_late_fee": 0.50, "allow_renewals": true, "max_renewals": 2}'::jsonb),
('inventory_config', '{"code_prefix": "RDW", "barcode_format": "CODE128", "default_shelf": "Main Floor", "default_rack": "A-01"}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
