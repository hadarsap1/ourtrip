-- Podcast audio clarity, round two (24/11/2026, DECISIONS #75, "still not
-- clear"): edited and joined episodes are now saved as 32 kHz mono WAV
-- instead of 24 kHz (lib/audioEdit.ts explains why - 24 kHz still cut the
-- top of a child's voice). A 20-minute edited episode is ~77 MB, so the
-- private `audio` bucket limit goes from 70 to 80 MB. Hadar approved the
-- higher limit (the project is on Supabase Pro). Nothing else changes: the
-- bucket stays private, the same audio types, and no policy is touched - who
-- may upload or replace audio is still 00044 / 00047 / 00049 (owners only).

update storage.buckets
   set file_size_limit = 83886080 -- 80 MB
 where id = 'audio';
