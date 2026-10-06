-- Calm Realm complete watch test user seed.
-- Run this whole file in the Supabase SQL editor.
--
-- Adds one participant with complete data for:
-- - ACT order used by the dashboard:
--   minigame1, act1, minigame2, act2, minigame3, act3, act4, minigame4, act5, act6
-- - 3 LoginSession values
-- - Watch Log samples with PPG, HRV, EDA, IMU, Class, and emotionValue
--
-- Realistic-ish sensor ranges used here:
-- - PPG / heart rate: 68-112 bpm
-- - HRV / RMSSD: 24-78 ms
-- - EDA: 0.08-1.45 uS
-- - IMU movement_g: 0.02-1.35 g above-rest movement intensity
-- - Class: 1-5, mapped in the app to emotion labels
--
-- Test profile email:
-- cr_complete_watch_001@example.test

begin;

create extension if not exists pgcrypto;

alter table public."SceneData"
    add column if not exists "LoginSession" smallint;

alter table public."Watch Log"
    add column if not exists "LoginSession" smallint;

alter table public."Watch Log"
    add column if not exists "Watch" text;

alter table public."Watch Log"
    add column if not exists "HRV" double precision;

alter table public."Watch Log"
    add column if not exists "Class" smallint;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'GameData'
          and column_name = 'sceneDataId'
    ) then
        alter table public."GameData" alter column "sceneDataId" drop not null;
    end if;
end $$;

delete from public."Watch Log"
where "userId" in (
    select "userId"
    from public."User"
    where "email" = 'cr_complete_watch_001@example.test'
);

delete from public."SceneData"
where "userId" in (
    select "userId"
    from public."User"
    where "email" = 'cr_complete_watch_001@example.test'
)
or "gameDataId" in (
    select "gameDataId"
    from public."GameData"
    where "userId" in (
        select "userId"
        from public."User"
        where "email" = 'cr_complete_watch_001@example.test'
    )
);

delete from public."GameData"
where "userId" in (
    select "userId"
    from public."User"
    where "email" = 'cr_complete_watch_001@example.test'
);

delete from public."Customize"
where "userId" in (
    select "userId"
    from public."User"
    where "email" = 'cr_complete_watch_001@example.test'
);

delete from public."User"
where "email" = 'cr_complete_watch_001@example.test';

do $$
declare
    new_user_id bigint;
    new_game_data_id bigint;
    session_no integer;
    act_index integer;
    sample_no integer;
    act_label text;
    base_time timestamptz;
    class_value smallint;
    emotion_label text;
    ppg_value double precision;
    hrv_value double precision;
    eda_value double precision;
    imu_value double precision;
    act_labels text[] := array[
        'minigame1',
        'act1',
        'minigame2',
        'act2',
        'minigame3',
        'act3',
        'act4',
        'minigame4',
        'act5',
        'act6'
    ];
begin
    insert into public."User" (
        "email",
        "name",
        "lastname",
        "school",
        "age",
        "gender",
        "Watch",
        "created_at",
        "updatedAt"
    )
    values (
        'cr_complete_watch_001@example.test',
        'Complete',
        'WatchUser',
        'Calm Realm Test School',
        11,
        'Female',
        'CR-WATCH-COMPLETE-001',
        now() - interval '4 days',
        now()
    )
    returning "userId" into new_user_id;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'User'
          and column_name = 'hasCustomized'
    ) then
        execute 'update public."User" set "hasCustomized" = true where "userId" = $1'
        using new_user_id;
    end if;

    insert into public."Customize" (
        "userId",
        "characterIndex",
        "SkinTextureIndex",
        "HairColor",
        "SuitColor",
        "BowColor",
        "BeltColor",
        "CharacterName"
    )
    values (
        new_user_id,
        2,
        4,
        '3B2A20FF',
        '4D908EFF',
        'F9C74FFF',
        '277DA1FF',
        'Mina'
    );

    for session_no in 1..3 loop
        base_time :=
            date_trunc('day', now())
            - interval '3 days'
            + ((session_no - 1) || ' days')::interval
            + interval '8 hours';

        for act_index in 1..array_length(act_labels, 1) loop
            act_label := act_labels[act_index];

            insert into public."GameData" ("userId", "act")
            values (new_user_id, act_label)
            returning "gameDataId" into new_game_data_id;

            insert into public."SceneData" (
                "gameDataId",
                "details",
                "act",
                "createdAt",
                "updatedAt",
                "userId",
                "LoginSession"
            )
            values (
                new_game_data_id,
                jsonb_build_object(
                    'seedUser', 'complete_watch_001',
                    'loginSession', session_no,
                    'act', act_label,
                    'completed', true,
                    'minigameComplete', act_label like 'minigame%',
                    'score', 620 + (session_no * 35) + (act_index * 18),
                    'stars', 3,
                    'durationSeconds', 165 + (session_no * 15) + (act_index * 9),
                    'mistakes', greatest(0, 4 - session_no + (act_index % 2)),
                    'saveSource', 'sql_seed_complete_watch_test_user'
                ),
                act_label,
                base_time + ((act_index * 12) || ' minutes')::interval,
                base_time + ((act_index * 12 + 10) || ' minutes')::interval,
                new_user_id,
                session_no
            );

            for sample_no in 1..6 loop
                ppg_value :=
                    72
                    + (session_no * 2.6)
                    + (act_index * 1.7)
                    + (sample_no * 0.9)
                    + case
                        when act_label like 'minigame%' then 3.5
                        when act_label in ('act4', 'act5') then 5.5
                        else 0
                      end;

                hrv_value :=
                    72
                    - (session_no * 3.2)
                    - (act_index * 1.4)
                    + case
                        when act_label like 'minigame%' then -7.5
                        when act_label in ('act1', 'act2') then 4.5
                        else 0
                      end
                    + (sample_no % 3);

                eda_value :=
                    0.12
                    + (session_no * 0.05)
                    + (act_index * 0.035)
                    + (sample_no * 0.018)
                    + case
                        when act_label like 'minigame%' then 0.12
                        when act_label in ('act4', 'act5') then 0.18
                        else 0
                      end;

                imu_value :=
                    0.04
                    + (sample_no * 0.035)
                    + case
                        when act_label like 'minigame%' then 0.62 + (act_index * 0.015)
                        when act_label in ('act4', 'act5') then 0.38 + (act_index * 0.012)
                        when act_label in ('act1', 'act2') then 0.10
                        else 0.22
                      end
                    + (session_no * 0.025);

                class_value :=
                    case
                        when act_label like 'minigame%' and sample_no in (2, 3, 4) then 1
                        when hrv_value >= 58 and eda_value < 0.55 then 2
                        when ppg_value < 92 and eda_value < 0.80 then 3
                        when eda_value >= 0.95 or ppg_value >= 100 then 4
                        else 5
                    end;

                emotion_label :=
                    case class_value
                        when 1 then 'สนุก'
                        when 2 then 'ดี'
                        when 3 then 'ปกติ'
                        when 4 then 'ไม่ดี'
                        else 'ไม่มีเกม'
                    end;

                insert into public."Watch Log" (
                    "act",
                    "timestamp",
                    "PPG",
                    "HRV",
                    "EDA",
                    "IMU",
                    "Class",
                    "emotionValue",
                    "userId",
                    "Watch",
                    "LoginSession"
                )
                values (
                    act_label,
                    base_time + ((act_index * 12 + sample_no) || ' minutes')::interval,
                    round(least(112, greatest(68, ppg_value))::numeric, 2)::double precision,
                    round(least(78, greatest(24, hrv_value))::numeric, 1)::double precision,
                    round(least(1.45, greatest(0.08, eda_value))::numeric, 3)::double precision,
                    jsonb_build_object(
                        'movement_g',
                        round(least(1.35, greatest(0.02, imu_value))::numeric, 3)
                    ),
                    class_value,
                    emotion_label,
                    new_user_id,
                    'CR-WATCH-COMPLETE-001',
                    session_no
                );
            end loop;
        end loop;
    end loop;
end $$;

commit;

-- Quick verification queries:
-- select "userId", "email", "name", "lastname", "Watch"
-- from public."User"
-- where "email" = 'cr_complete_watch_001@example.test';
--
-- select "LoginSession", count(distinct "act") as acts, count(*) as samples
-- from public."Watch Log"
-- where "userId" in (
--     select "userId"
--     from public."User"
--     where "email" = 'cr_complete_watch_001@example.test'
-- )
-- group by "LoginSession"
-- order by "LoginSession";
--
-- Expected:
-- LoginSession 1 = 10 acts, 60 samples
-- LoginSession 2 = 10 acts, 60 samples
-- LoginSession 3 = 10 acts, 60 samples
--
-- select "act", count(*) as samples, min("Class") as min_class, max("Class") as max_class
-- from public."Watch Log"
-- where "userId" in (
--     select "userId"
--     from public."User"
--     where "email" = 'cr_complete_watch_001@example.test'
-- )
-- group by "act"
-- order by array_position(
--     array['minigame1','act1','minigame2','act2','minigame3','act3','act4','minigame4','act5','act6'],
--     "act"
-- );
