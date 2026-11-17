-- The cash category reads "משיכת מזומן" in the budget table (it holds the ATM
-- withdrawals), not just "מזומן". Idempotent; renames only the category made
-- by 00097 (key 'cash').
update budget_categories
set label_he = 'משיכת מזומן'
where key = 'cash' and label_he <> 'משיכת מזומן';
