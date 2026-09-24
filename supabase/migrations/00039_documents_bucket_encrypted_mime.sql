-- Locking a document never worked: the vault encrypts the file client-side
-- and uploads the container as application/octet-stream (lib/docCrypto
-- encryptBlob, lib/data/documents protectDocument), but the documents bucket
-- (00005) only allows pdf and image types. Storage rejected every encrypted
-- upload with 400, so "lock" failed right after the passphrase / biometric
-- prompt and the document stayed plaintext.
--
-- Allow octet-stream on this bucket only. No policy change: access is still
-- governed by documents_owner_* on storage.objects (00005), owners only.
-- The 20MB size limit is unchanged; AES-GCM adds 28 bytes per file.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/octet-stream'
]
where id = 'documents';
