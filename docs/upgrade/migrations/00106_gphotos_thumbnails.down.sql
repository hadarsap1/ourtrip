-- Rollback for 00106_gphotos_thumbnails.sql. The .thumb.jpg files in the
-- gphotos bucket can stay: nothing reads them without the column.

alter table google_photos drop column if exists thumb_path;
