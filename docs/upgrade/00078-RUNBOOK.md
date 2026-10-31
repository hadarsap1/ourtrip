# 00078 - one journal: running it on production

Project: `ourtrip` (`xeqfcrxrpfjlqhkijrwd`). PR: https://github.com/hadarsap1/ourtrip/pull/167

Order matters: **DB first, then the functions, then merge.** If the PR is merged
before step 1, Vercel ships code that reads `posts.entry_date` / `posts.mood`,
which do not exist yet, and the journal breaks.

## 1. Run the migration (about 1 minute)

1. Open the file and copy it all (the "Copy raw file" button at the top right):
   https://github.com/hadarsap1/ourtrip/blob/claude/journal-stories-merge/supabase/migrations/00078_journal_into_stories.sql
2. Open a new query in the SQL Editor:
   https://supabase.com/dashboard/project/xeqfcrxrpfjlqhkijrwd/sql/new
3. Paste and click **Run**. If it asks to confirm the destructive operations
   (dropping columns, renaming the table) - confirm.
   Expected result: `Success. No rows returned`.

All or nothing: if something fails, nothing changes. Checked 31/10: 0 journal
entries and 0 stories in production, so no data moves.

## 2. Verify (30 seconds)

1. Copy: https://github.com/hadarsap1/ourtrip/blob/claude/journal-stories-merge/docs/upgrade/migrations/00078_journal_into_stories.verify.sql
2. New query in the SQL Editor, paste, **Run**.
3. Expected: 13 rows, all with `ok = true`. If any is `false` - stop and send it to Claude.

## 3. Redeploy two functions

`push-send` (evening nudge) and `backup-weekly` (weekly backup) read the old
journal table. Until they are redeployed the evening nudge goes to everyone,
including whoever already wrote.

From a computer, in the repo on the branch:

```bash
git fetch origin claude/journal-stories-merge
git checkout claude/journal-stories-merge
npx supabase functions deploy push-send backup-weekly --project-ref xeqfcrxrpfjlqhkijrwd
```

Or ask Claude to deploy them (needs an approval on the Supabase window).

## 4. Merge the PR

https://github.com/hadarsap1/ourtrip/pull/167 - after Vercel deploys, check the
journal as a parent, as "view as guest" and as "view as kid".

## If something has to be undone

Only before the new journal is used (entries written after 00078 are not copied back):
https://github.com/hadarsap1/ourtrip/blob/claude/journal-stories-merge/docs/upgrade/migrations/00078_journal_into_stories.down.sql
Paste into the SQL Editor, **Run**, and revert to the previous app version in Vercel.
Tested locally: rollback and then re-applying 00078 both pass.
