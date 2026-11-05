UPDATE public.settings
SET setting_value = jsonb_set(
    jsonb_set(
        setting_value,
        '{name}',
        to_jsonb(CASE
            WHEN setting_value->>'name' = 'Readowl Community Library' THEN 'MeelieFont Library'
            ELSE setting_value->>'name'
        END)
    ),
    '{email}',
    to_jsonb(CASE
        WHEN setting_value->>'email' = 'contact@readowl.library' THEN ''
        ELSE COALESCE(setting_value->>'email', '')
    END)
)
WHERE setting_key = 'library_info'
  AND (
      setting_value->>'name' = 'Readowl Community Library'
      OR setting_value->>'email' = 'contact@readowl.library'
  );
