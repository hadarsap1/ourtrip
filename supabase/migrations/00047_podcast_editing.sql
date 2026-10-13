-- Parents edit podcast episodes (13/10/2026): keep a part, cut a part, add
-- more at the end, rename. The edited take is saved as 16 kHz mono WAV
-- (lib/audioEdit.ts explains why), so the private `audio` bucket must accept
-- it. Episodes may also run to 20 minutes now (lib/audio.ts): an edited
-- 20-minute episode is ~38 MB, so the bucket limit goes from 25 to 50 MB -
-- also the default per-file ceiling of a Supabase project. Nothing else
-- changes:
--
--   * replacing an episode's audio is an UPDATE of file_path - owners only
--     (episodes_owner_all); episodes_guard (00044) already reverts file_path
--     for a kid, so a kid cannot swap the audio of even their own pending take
--   * editing keeps status and shared_with_guests as they were: a parent
--     tidying an approved episode does not re-open its approval

update storage.buckets
   set file_size_limit = 52428800, -- 50 MB
       allowed_mime_types = array[
     'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/aac',
     'audio/x-m4a', 'audio/wav', 'audio/x-wav'
   ]
 where id = 'audio';
