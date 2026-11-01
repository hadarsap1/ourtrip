-- Podcast audio quality (01/11/2026, "the episodes are not clear"): edited and
-- joined episodes are now saved as 24 kHz mono WAV instead of 16 kHz
-- (lib/audioEdit.ts explains why - 16 kHz cut the consonants). A 20-minute
-- edited episode is ~58 MB, so the private `audio` bucket limit goes from 50
-- to 70 MB. Hadar approved the higher limit. Nothing else changes: the bucket
-- stays private, the same audio types, and no policy is touched - who may
-- upload or replace audio is still 00044 / 00047 / 00049 (owners only).

update storage.buckets
   set file_size_limit = 73400320 -- 70 MB
 where id = 'audio';
