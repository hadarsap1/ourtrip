-- 00080: the audio bucket takes a 20-minute 24 kHz WAV and stays private.
begin;
\i scripts/rls/seed.sql

select rls.check('audio bucket: private, 70 MB, still accepts WAV',
  (select not public and file_size_limit = 73400320 and 'audio/wav' = any(allowed_mime_types)
     from storage.buckets where id = 'audio'));

rollback;
