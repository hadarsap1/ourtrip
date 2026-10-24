-- Drops what 00064 stopped using: the group-to-kid link (00063) and its
-- helpers. Nothing reads them since 00064, and the table was never filled.
-- Kept apart from 00064 because drops need the owner's approval to run in
-- production; 00064 works with these still in place.

drop table guest_group_kids;
drop function public.guest_group_kids_guard();
drop function public.my_kid_labels();
