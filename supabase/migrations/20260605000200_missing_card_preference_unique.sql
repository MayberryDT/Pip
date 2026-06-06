create unique index missing_card_preferences_user_issuer_unique_idx
on public.missing_card_preferences (user_id, lower(issuer_name));
