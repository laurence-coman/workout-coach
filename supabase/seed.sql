-- Seed data from the ChatGPT training repository export (July 2026).
-- Run AFTER schema.sql in the Supabase SQL Editor.

-- ============ GOALS ============
insert into goals (title, target, deadline, status, sort) values
('Ultramarathon in December', '50K finish (pending foot clearance - see PLAN_REVIEW.md on timeline risk)', '2026-12-15', 'active', 1),
('Improve bench press', 'Current: 195x2 / 175x5x3. Autoregulated top set + back-offs', null, 'active', 2),
('Improve pull-ups', 'Comfortable 5x8 bodyweight with long rest, then add total clean reps', null, 'active', 3),
('Posterior chain + unilateral leg strength', 'RDL 125x8x3 next; Bulgarians toward 18kg x8/leg', null, 'active', 4),
('Preserve aerobic fitness while not running', 'Swim/bike (VO2max 50, LT HR 166); hold swim pace near 1:49/100yd', null, 'active', 5),
('Athletic body composition', '~175 lb at 5''9"; prior target was ~10 lb loss - pause deficit while bone heals', null, 'active', 6);

-- ============ GUARDRAILS ============
insert into guardrails (category, rule, sort) values
('injury', 'Suspected minor midfoot stress fracture; differential diagnosis still outstanding. Pain has improved over the last few weeks without running. A cautious TEST run is planned within 1-2 weeks: short walk/run on a flat, soft surface, stop immediately at any foot pain, and judge the next-morning and 48h response before any further running. No ramp until the test and follow-up response are clean.', 1),
('injury', 'The earlier plantar fasciitis diagnosis was a misdiagnosis - do not reference PF as current or past explanation for the foot. History does include a left hamstring strain.', 2),
('programming', 'Sessions 50-75 min; warm-ups 5 min or less unless symptoms justify more.', 3),
('programming', 'Do not repeat major exercises from the prior day without a clear programming reason.', 4),
('programming', 'Never place rows immediately before pull-ups when pull-up performance matters. Fresh = 5x8; after rows performance drops materially.', 5),
('programming', 'Bench first on bench days.', 6),
('programming', 'Stay at bodyweight pull-ups until 5x8 is comfortable - no weighted pull-ups prematurely.', 7),
('programming', 'Rest day NOT on weekends - weekends are easier to train.', 8),
('programming', 'Always independently verify barbell plate math before prescribing. 135=45/side; 155=45+10; 165=45+10+5; 175=65/side; 185=45+25; 195=45+25+5.', 9),
('general', 'Use pounds in the US; kilograms when traveling internationally unless equipment dictates.', 10),
('logging', 'Log every completed workout with date, exercise order, exact sets/reps/load, RPE or RIR, pain, and observations. Planned-only sessions are never logged as completed.', 11);

-- Research-informed additions from PLAN_REVIEW.md (July 2026). Delete any you disagree with.
insert into guardrails (category, rule, sort) values
('programming', 'Separate heavy lower-body lifting and hard endurance sessions by 3+ hours, ideally a day. Keep easy aerobic days genuinely easy (zone 2, not tempo).', 12),
('nutrition', 'No calorie deficit while the bone stress injury heals. Check vitamin D level and calcium intake (~1,500 mg/day target) at the next clinical visit.', 13);

insert into goals (title, target, deadline, status, sort) values
('Resolve midfoot ddx + run test', 'Cautious test run within 1-2 weeks (short walk/run, soft surface, stop at any pain). Imaging/clinical opinion still recommended before a real build. Decision gate for December ultra: build must start by early September.', '2026-08-01', 'active', 7);

-- ============ COACH NOTES ============
update profile set
  coach_notes = 'BENCHMARKS: Bench 85kg x5 (historical); 195lb x2 controlled + 175x5x3 (July 2026). Incline DB 45s x10,10,9 @30deg. Pull-ups fresh 5x8=40 (repeatable); after pressing/rows 6,6,6,7=25 (order-dependent, not regression). T-bar row 70lb x9,8,10 (target 10/10/10 before adding load). RDL 115x8x3 (next: 125 if next-day response normal). Bulgarian split squat 14kg KBs x8/leg x3, felt easy (consider 18kg - big jump). Single-leg RDL 25lb x10/leg x2 (stay until control is consistent). Arnold press 12.5kg x10. Swim: 2,000yd in 54:37, 1:49/100yd, SWOLF 38, 11.2 strokes/length, avg HR 140 (July 7) - prior 2,050yd @1:54/100, SWOLF 41. VO2max 50. LT HR 166 (Jan 2026).
TRAINING BLOCK (revised per July 2026 plan review): A Upper Strength (bench focus), B Lower Strength (RDL/Bulgarians/SL-RDL/lower leg), C1 Swim Threshold (~2,000-2,200yd intervals), C2 Easy zone-2 swim, D Upper Pull/Hypertrophy (pull-ups fresh), E Long Zone 2 bike 60-90min, F Upper Strength repeat. Rest day midweek. User declined aqua jogging - do not suggest it; use easy swims and bike for zone 2.
RETURN-TO-RUN: test run planned within 1-2 weeks of July 11 (short walk/run, flat soft surface, stop at any pain, judge 24-48h response). If clean, progress walk/run to continuous over 3-4 weeks. Gates before ramping: no palpation tenderness + pain-free single-leg calf raise; imaging/clinical opinion still recommended. Then add low-dose plyometrics (pogos, skips) before speed work. Lifting drops to 2x/week at same loads during the running build.
PREFERENCES: Efficient supersets, alternating muscle groups; low-fatigue tibialis/calf work during pull-up rests OK if foot pain-free. Core: hanging leg raises, dead bugs, bicycle crunches - obliques are the consistent limiter. Regular tibialis + calf work. Moving from glute bridges toward RDLs/split squats/SL-RDLs. Wants expert, science-based hybrid coaching - not mirroring suggestions. 25-yard pool; kickboard, pull buoy, fins available.
INJURY STATUS (July 2026): Midfoot pain began after mileage ramp + 13-mile run (~early June). Suspected minor stress fracture; ddx outstanding; the earlier PF label was a misdiagnosis. Pain improving over recent no-running weeks. July 11 lower session 0/10 foot pain. Test run planned within 1-2 weeks. December ultra timeline is tight: running build must start by early September.',
  updated_at = now()
where id = 1;

-- ============ WORKOUT HISTORY ============
insert into workouts (date, type, name, duration_min, distance_km, avg_hr, effort, notes, source) values
('2025-12-23', 'other', 'Full-body circuit + 3-mile run', null, 4.83, null, null, 'Circuit 3 rounds: pull-ups, squats, push-ups, plank, lunges, sit-ups. Run 3 mi @ ~9:40/mi.', 'manual'),
('2026-01-01', 'run', 'Circuit + VO2 intervals', null, null, null, null, 'Circuit 4-5 rounds; 6 x 2min hard / 1min easy. LT HR ~166 recorded.', 'manual'),
('2026-01-03', 'lift', 'Upper strength', null, null, null, null, 'Bench 115x8; 135x6,5,6. Lat pulldown 100. DB row 22.5-25. Lateral raise 10.', 'manual'),
('2026-01-08', 'swim', 'Structured swim', 48, null, null, null, '45-50 min structured swim with HR data. Distance not preserved (partial record).', 'manual'),
('2026-01-09', 'lift', 'Upper strength', null, null, null, null, 'DB row 30x10,12,12. DB chest press 45x10, 50x10. External rotation 5-10. Pulldown 100. Incline push-ups. Lateral raise 10.', 'manual'),
('2026-01-19', 'lift', 'Upper strength + bike', null, null, null, null, 'DB row 30x12, 32.5x12,12. Chest press 45x10, 50x10. Pulldown 110x10,10,8. Incline push-ups 20,20,20. Lateral raise 10x12x3. Bike 10 min.', 'manual'),
('2026-06-20', 'lift', 'Travel full body (Korea)', null, null, null, null, 'Bench completed at prescribed weights (sequence not preserved). Pulldown 40/45/50kg x12. Calves + tibialis. EZ curl 20/25kg x12. Triceps pushdown 40/45kg x12. Bridges. Bulgarians + dead bugs (partial record).', 'manual'),
('2026-06-23', 'lift', 'Heavy bench + full body (date approximate)', null, null, null, null, 'Bench 85kg x5. Bulgarians. Pull-ups 32 total. Calves/tibialis. Bridges. Plate raises. Late June - exact date uncertain.', 'manual'),
('2026-06-24', 'lift', 'Vietnam DB-only upper/full body (date approximate)', null, null, null, null, 'DB row 22.5kg x12 top set. Arnold press 12.5kg x10. Hammer curls. Core. Calves/tibialis. Push-ups. Late June - exact date uncertain.', 'manual'),
('2026-06-26', 'lift', 'Vietnam heat-shortened full body', null, null, null, null, '40 pull-ups (5x8 fresh). Lower body. Arnold press. Dead bugs. Calf/tibialis.', 'manual'),
('2026-06-30', 'lift', 'Full body + beach pump', null, null, null, null, '40 pull-ups. Bulgarians 12.5kg DBs x10/leg x3. Incline DB 20kg x12,12,8. Shoulders, arms, core. 25 push-ups.', 'manual'),
('2026-07-07', 'swim', 'Pool swim - tempo', 55, 1.83, 140, 5, '2,000 yd in 54:37 (moving 36:20). 1:49/100yd avg. SWOLF 38, 11.2 strokes/length, 25 spm. TE 3.8/2.0, load 152. Five 200s @ 1:52-1:55/100. Max HR 174. Felt strong.', 'manual'),
('2026-07-08', 'lift', 'Upper Strength A', null, null, null, null, 'Bench 195x2 controlled (plate-math error) then 175x5x3. Incline DB 45s x10,10,9 @30deg. T-bar row 70lb x9,8,10. Pull-ups after pressing/rows: 6,6,6,7=25. Triceps, core, lower-leg work. Date inferred.', 'manual'),
('2026-07-11', 'lift', 'Lower strength / runner durability', null, null, null, 7, 'RDL 115x8x3 (~2 RIR). Bulgarian split squat 14kg KBs x8/leg x3 - felt easy. Single-leg RDL 25lb x10/leg x2. Tibialis + calf. Core - obliques limiting, 15s pause in round 2 leg raises. 30-min walk home. Foot 0/10 during and next morning. Date inferred.', 'manual')
on conflict do nothing;
