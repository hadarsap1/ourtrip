-- Demo family for scripts/uicrawl: two parents, two kids (one with a tablet),
-- one approved guest, two waiting join requests, 35 itinerary days in two
-- countries, expenses, photos (some pending, some in albums), jar quotes, a
-- country card, stories, chat. Invented names; never real data.
\set T '''11111111-0000-0000-0000-000000000001'''
insert into trips (id, name, start_date, end_date, base_currency, is_active) values (:T, 'מסביב לעולם', '2026-10-31', '2027-03-15', 'ILS', true);
insert into auth.users (id, email, raw_app_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','abba@test.local','{"provider":"google"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','ima@test.local','{"provider":"google"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','kid1@test.local','{"provider":"email"}'),
 ('aaaaaaaa-0000-0000-0000-000000000005','savta@test.local','{"provider":"google"}');
insert into members (id, trip_id, auth_user_id, email, display_name, role) values
 ('bbbbbbbb-0000-0000-0000-000000000001',:T,'aaaaaaaa-0000-0000-0000-000000000001','abba@test.local','אבא','owner'),
 ('bbbbbbbb-0000-0000-0000-000000000002',:T,'aaaaaaaa-0000-0000-0000-000000000002','ima@test.local','אמא','owner'),
 ('bbbbbbbb-0000-0000-0000-000000000003',:T,'aaaaaaaa-0000-0000-0000-000000000003',null,'נועה','kid'),
 ('bbbbbbbb-0000-0000-0000-000000000004',:T,null,null,'יואב','kid'),
 ('bbbbbbbb-0000-0000-0000-000000000005',:T,'aaaaaaaa-0000-0000-0000-000000000005','savta@test.local','סבתא רותי','guest');
insert into kid_devices (member_id, device_token_hash, pin_hash, approved_by) values ('bbbbbbbb-0000-0000-0000-000000000003','x','x','bbbbbbbb-0000-0000-0000-000000000001');
insert into guests_allowlist (trip_id, email, invited_by) values (:T,'savta@test.local','bbbbbbbb-0000-0000-0000-000000000001');
insert into guest_join_requests (trip_id, email, display_name, kid_names) values (:T,'dod@test.local','דוד משה','{איתי}'), (:T,'morah@test.local','המורה דנה ממש ארוך שם משפחה ארוך מאוד','{}');

insert into itinerary_days (id, trip_id, date, location_name, country_code, lat, lng, notes)
select ('dddddddd-0000-0000-0000-' || lpad(g::text,12,'0'))::uuid, :T, date '2026-10-31' + g,
  case when g < 20 then (array['האנוי','הא לונג','הוי אן','הו צי מין'])[1 + g/5] else (array['טוקיו','קיוטו','אוסקה'])[1 + (g-20)/5 % 3] end,
  case when g < 20 then 'VN' else 'JP' end,
  case when g < 20 then 21.03 - g*0.5 else 35.68 end, case when g < 20 then 105.85 else 139.69 end,
  case when g = 15 then 'יום ארוך, לקחת מים וכובעים' end
from generate_series(0, 34) g;
insert into itinerary_items (day_id, title, start_time, end_time, location_name, notes, is_outdoor, status, shared_with_guests, sort_order)
select d.id, x.title, x.st::time, x.et::time, x.loc, x.notes, x.outd, (case when d.date < date '2026-11-15' then 'done' else 'planned' end)::item_status, x.sh, x.so
from itinerary_days d, (values
 ('ארוחת בוקר במלון','08:00','09:00','המלון',null,false,false,1),
 ('סיור אופניים בין שדות האורז עם מדריך מקומי ועצירה בכפר הדייגים','09:30','12:30','קאם תאן','להביא קרם הגנה',true,true,2),
 ('שיעור בישול וייטנאמי','14:00','16:30','בית הספר לבישול',null,false,true,3),
 ('שוק הלילה','19:00',null,'העיר העתיקה',null,true,false,4)) as x(title,st,et,loc,notes,outd,sh,so)
where d.date between date '2026-11-10' and date '2026-11-20';

insert into budget_categories (id, trip_id, key, label_he, planned_amount) values
 ('cccccccc-0000-0000-0000-000000000001',:T,'food','אוכל',40000),
 ('cccccccc-0000-0000-0000-000000000002',:T,'lodging','לינה',90000),
 ('cccccccc-0000-0000-0000-000000000003',:T,'transport','תחבורה',60000),
 ('cccccccc-0000-0000-0000-000000000004',:T,'fun','אטרקציות',30000);
insert into trip_budget (trip_id, total_budget) values (:T, 250000);
insert into fx_rates (day, currency, rate_to_ils) select d::date, c, r from generate_series(date '2026-11-01', date '2026-11-15', '1 day') d, (values ('VND',0.000142),('USD',3.61),('JPY',0.0236),('EUR',3.95)) v(c,r);
insert into expenses (trip_id, category_id, amount, currency, amount_ils, description, spent_on, created_by, country_code, paid_in_cash, is_cash_withdrawal)
select :T, ('cccccccc-0000-0000-0000-00000000000' || (1 + g % 4))::uuid, 150000 + g*37000, 'VND', round((150000 + g*37000)*0.000142,2),
 (array['פו בוקר','מונית לשדה','כניסה למקדש','קפה קוקוס','כביסה','ארוחת ערב משפחתית במסעדה על הנהר עם דגים'])[1 + g % 6], date '2026-11-01' + (g % 15),
 'bbbbbbbb-0000-0000-0000-000000000001','VN', g % 3 = 0, false from generate_series(1, 40) g;
insert into expenses (trip_id, category_id, amount, currency, amount_ils, description, spent_on, created_by, country_code, is_cash_withdrawal)
values (:T,'cccccccc-0000-0000-0000-000000000001',5000000,'VND',710,'משיכה מכספומט','2026-11-02','bbbbbbbb-0000-0000-0000-000000000001','VN',true),
 (:T,'cccccccc-0000-0000-0000-000000000002',1234567.89,'JPY',29135.80,'מלון בטוקיו - שולם מראש','2026-11-05','bbbbbbbb-0000-0000-0000-000000000002','JP',false);

insert into albums (id, trip_id, name, shared_with_guests, created_by) values
 ('eeeeeeee-0000-0000-0000-000000000001',:T,'אוכל מוזר שאכלנו',true,'bbbbbbbb-0000-0000-0000-000000000001'),
 ('eeeeeeee-0000-0000-0000-000000000002',:T,'חיות',false,'bbbbbbbb-0000-0000-0000-000000000002');
insert into photos (trip_id, uploaded_by, file_path, caption, taken_on, status, shared_with_guests, approved_by, album_id)
select :T, (case when g % 4 = 0 then 'bbbbbbbb-0000-0000-0000-000000000003' else 'bbbbbbbb-0000-0000-0000-000000000001' end)::uuid,
 'trip/p' || g || '.jpg', case when g % 3 = 0 then 'שקיעה מעל המפרץ, היום הכי יפה עד עכשיו' end, date '2026-11-01' + (g % 15),
 (case when g % 4 = 0 and g % 8 <> 0 then 'pending' else 'approved' end)::photo_status, g % 2 = 0,
 case when not (g % 4 = 0 and g % 8 <> 0) then 'bbbbbbbb-0000-0000-0000-000000000001'::uuid end,
 case when g > 24 then 'eeeeeeee-0000-0000-0000-000000000001'::uuid when g > 20 then 'eeeeeeee-0000-0000-0000-000000000002'::uuid end
from generate_series(1, 30) g;

insert into jar_quotes (trip_id, quote, meant, background, said_by, said_by_other, said_on, country_code, shared_with_guests, created_by) values
 (:T,'אבא, למה הים פה מלוח יותר מבבית?',null,'אחרי שבלעה מים בהא לונג','{bbbbbbbb-0000-0000-0000-000000000003}','{}','2026-11-06','VN',true,'bbbbbbbb-0000-0000-0000-000000000001'),
 (:T,'אני רוצה עוד נודלס מהסוג של האתמול',  'אטריות פו','', '{bbbbbbbb-0000-0000-0000-000000000004}','{}','2026-11-09','VN',false,'bbbbbbbb-0000-0000-0000-000000000002'),
 (:T,'המדריך אמר שהתאו הוא הטרקטור של וייטנאם ושאסור ללטף אותו מאחור כי הוא לא רואה אותך ונבהל ואז הוא בועט חזק מאוד',null,null,'{bbbbbbbb-0000-0000-0000-000000000003,bbbbbbbb-0000-0000-0000-000000000004}','{המדריך טואן}','2026-11-12','VN',true,'bbbbbbbb-0000-0000-0000-000000000001');
insert into country_profiles (trip_id, country_code, flag_meaning, population, capital, language, currency, size_vs_israel, national_symbol) values
 (:T,'VN','הדגל אדום עם כוכב צהוב בעל חמש קצוות. האדום מסמל את המהפכה ואת הדם שנשפך במאבק לעצמאות, והכוכב את אחדות העם. הדגל אומץ בשנת 1945.','בערך 100 מיליון איש - פי 10 מישראל','האנוי, עיר בת יותר מאלף שנה','וייטנאמית, שפה טונאלית עם שישה טונים. שלום: סין צאו','דונג. על כל השטרות מופיע הו צי מין','בערך 330 אלף קמ"ר - פי 15 מישראל','פרח הלוטוס, שצומח נקי מתוך הבוץ');
insert into destination_facts (trip_id, country_code, location_name, fact, emoji, sort_order) values
 (:T,'VN','הוי אן','בעיר העתיקה אסור לנסוע במכוניות, רק אופניים והולכי רגל','🚲',1),
 (:T,'VN','הוי אן','הפנסים הצבעוניים עשויים ממשי ובמבוק','🏮',2);
insert into checklists (id, trip_id, title) values ('ffffffff-0000-0000-0000-000000000001',:T,'אריזה לטיסה ליפן');
insert into checklist_items (checklist_id, label, checked, sort_order) select 'ffffffff-0000-0000-0000-000000000001', l, o % 2 = 0, o from (values ('דרכונים',1),('מטענים',2),('תרופות',3),('מעילים',4),('אוזניות לילדים',5)) v(l,o);
insert into phrasebook_entries (trip_id, language, country_code, category, phrase_he, phrase_local, phonetic_he) values
 (:T,'vi','VN','greet','שלום','Xin chào','סין צאו'),(:T,'vi','VN','greet','תודה','Cảm ơn','קאם און'),(:T,'vi','VN','food','בלי חריף בבקשה','Không cay','חום קאי'),(:T,'vi','VN','emergency','איפה בית החולים?','Bệnh viện ở đâu?','בן ויין או דאו');
insert into emergency_info (trip_id, country_code, content) values (:T,'VN','{"police":"113","ambulance":"115","fire":"114","embassy":{"name":"שגרירות ישראל בהאנוי","phone":"+84 24 3718 7500","address":"68 Nguyen Thai Hoc"},"insurance":{"name":"ביטוח","phone":"+972-3-0000000","policy":"123456"}}');
insert into posts (id, trip_id, author_id, title, body, country_code, status, visibility, published_at, approved_by, entry_date, place_label) values
 ('99999999-0000-0000-0000-000000000001',:T,'bbbbbbbb-0000-0000-0000-000000000002','שבוע ראשון בוייטנאם','הגענו להאנוי אחרי טיסה ארוכה. הילדים נרדמו במונית. למחרת יצאנו לעיר העתיקה ואכלנו פו ברחוב על שרפרפים קטנים.','VN','approved','guests',now() - interval '5 days','bbbbbbbb-0000-0000-0000-000000000002','2026-11-07','האנוי'),
 ('99999999-0000-0000-0000-000000000002',:T,'bbbbbbbb-0000-0000-0000-000000000003','ראיתי תאו!','היום ראיתי תאו אמיתי בשדה והוא היה ענק','VN','pending','guests',null,null,'2026-11-12','הוי אן'),
 ('99999999-0000-0000-0000-000000000003',:T,'bbbbbbbb-0000-0000-0000-000000000001','רק למשפחה','פוסט פרטי','VN','approved','family',now() - interval '2 days','bbbbbbbb-0000-0000-0000-000000000001','2026-11-13','הוי אן');
insert into messages (trip_id, sender_id, body, channel, approved_at, approved_by) values
 (:T,'bbbbbbbb-0000-0000-0000-000000000005','מתגעגעים! איך האוכל?','guests',now(),'bbbbbbbb-0000-0000-0000-000000000001'),
 (:T,'bbbbbbbb-0000-0000-0000-000000000001','מעולה, הילדים אוכלים הכל','guests',now(),'bbbbbbbb-0000-0000-0000-000000000001'),
 (:T,'bbbbbbbb-0000-0000-0000-000000000002','לא לשכוח לקנות כרטיסים לרכבת','family',now(),'bbbbbbbb-0000-0000-0000-000000000002');
insert into documents (trip_id, title, tag, file_path, expires_at) values (:T,'דרכון נועה','passport','docs/x.enc','2027-01-10'),(:T,'ביטוח נסיעות','insurance','docs/y.enc',null);
insert into bookings (trip_id, type, title, start_date, end_date, confirmation_code, cost, currency, status) values
 (:T,'hotel','Hoi An Riverside','2026-11-10','2026-11-16','HX99231',4200,'ILS','paid'),(:T,'flight','דא נאנג - טוקיו','2026-11-20','2026-11-20','VJ8812',5600,'ILS','booked');
insert into pocket_money (trip_id, kid_id, allowance, currency) values (:T,'bbbbbbbb-0000-0000-0000-000000000003',50,'ILS');
insert into guest_join_links (trip_id, token, open_token, created_by) values (:T,'demo1234','open5678','bbbbbbbb-0000-0000-0000-000000000001');
-- the newest shared update carries a shared, approved photo (rule 3 lets a guest see it)
insert into post_photos (post_id, photo_id, position)
select '99999999-0000-0000-0000-000000000001', id, 0 from photos where file_path = 'trip/p2.jpg';
update posts set entry_date = '2026-11-14', place_label = 'הוי אן', title = 'שבוע שני בוייטנאם', body = 'רכבנו על אופניים בין שדות האורז, ראינו תאו מקרוב, ובערב אכלנו בשוק הלילה מתחת לפנסים הצבעוניים.' where id = '99999999-0000-0000-0000-000000000001';
insert into episodes (trip_id, recorded_by, title, file_path, status, shared_with_guests, approved_by, created_at)
values ('11111111-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000003','פרק 1: השוק הצף','ep/1.m4a','approved',true,'bbbbbbbb-0000-0000-0000-000000000001', now());
-- an insert is forced to "pending" for a kid's recording; a parent approves and shares it
update episodes set status = 'approved', shared_with_guests = true, approved_by = 'bbbbbbbb-0000-0000-0000-000000000001';
update posts set published_at = now() - interval '1 day' where id = '99999999-0000-0000-0000-000000000001';
