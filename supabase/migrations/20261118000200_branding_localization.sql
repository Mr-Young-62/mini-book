-- Normalize the placeholder library profile from the original seed.
-- Only replace values that still match the old US-centric defaults, so real
-- library edits made through Settings are preserved.

UPDATE public.settings
SET setting_value = setting_value || jsonb_build_object(
  'address', CASE
    WHEN setting_value->>'address' = '452 Bookkeeper Way, Alexandria, VA' THEN ''
    ELSE COALESCE(setting_value->>'address', '')
  END,
  'phone', CASE
    WHEN setting_value->>'phone' = '+1 (555) 234-5678' THEN ''
    ELSE COALESCE(setting_value->>'phone', '')
  END,
  'currency', CASE
    WHEN setting_value->>'currency' = '$' THEN 'IDR'
    ELSE COALESCE(setting_value->>'currency', 'IDR')
  END
)
WHERE setting_key = 'library_info'
  AND (
    setting_value->>'address' = '452 Bookkeeper Way, Alexandria, VA'
    OR setting_value->>'phone' = '+1 (555) 234-5678'
    OR setting_value->>'currency' = '$'
  );
