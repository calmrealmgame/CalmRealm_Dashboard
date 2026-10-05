"use client";

import { CircleCheckBig, Gauge, UsersRound } from "lucide-react";
import { useMemo } from "react";
import type { Participant, SceneData, WatchLog } from "@/lib/supabase";
import {
  BarPanel,
  sortActs,
  formatActLabel,
  DataTable,
  DonutPanel,
  MetricCard,
  PageHeader,
  countBy,
  formatNumber,
  formatPercent,
  latestDate,
  matchesParticipant,
  participantName,
  sceneDuration,
  withinDateRange,
  type Filters,
} from "./shared";

function actPlayDuration(scenes: SceneData[]) {
  const playDurations = scenes
    .map(sceneDuration)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  if (!playDurations.length) return null;
  return playDurations.reduce((sum, duration) => sum + duration, 0);
}

function actDurationMap(userScenes: SceneData[]) {
  const scenesByAct = new Map<string, SceneData[]>();
  userScenes.forEach((scene) => {
    const act = scene.act ?? "-";
    scenesByAct.set(act, [...(scenesByAct.get(act) ?? []), scene]);
  });

  return new Map(
    Array.from(scenesByAct, ([act, scenes]) => [act, actPlayDuration(scenes)]),
  );
}

function sceneActsInDataOrder(scenes: SceneData[]) {
  const seen = new Set<string>();
  const acts: string[] = [];
  scenes.forEach((scene) => {
    const act = formatActLabel(scene.act?.trim() || "");
    if (!act || seen.has(act)) return;
    seen.add(act);
    acts.push(act);
  });
  return sortActs(acts);
}

function SchoolSummaryPanel({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <article className="school-summary-panel">
      <div className="school-summary-head">
        <h3>School Distribution</h3>
        <span>{data.length} Schools</span>
      </div>
      <div className="school-summary-columns">
        <span>School</span>
        <span>Students</span>
      </div>
      <div className="school-summary-list">
        {data.length ? (
          data.map((school) => (
            <div className="school-summary-row" key={school.label}>
              <span>{school.label}</span>
              <strong>{school.value}</strong>
            </div>
          ))
        ) : (
          <p className="empty-state">No data</p>
        )}
      </div>
    </article>
  );
}

export function OverviewPage({
  participants,
  sceneData,
  watchLogs,
  filters,
  setFilters,
  canExport,
}: {
  participants: Participant[];
  sceneData: SceneData[];
  watchLogs: WatchLog[];
  filters: Filters;
  setFilters: (filters: Filters) => void;
  canExport: boolean;
}) {
  const availableActs = useMemo(
    () => sceneActsInDataOrder(sceneData),
    [sceneData],
  );

  const filteredParticipants = participants.filter((user) =>
    matchesParticipant(user, filters),
  );
  const filteredUserIds = new Set(
    filteredParticipants.map((user) => user.userId),
  );
  const filteredScenes = sceneData.filter(
    (scene) =>
      scene.userId !== null &&
      filteredUserIds.has(scene.userId) &&
      (!filters.act.length || filters.act.includes(String(scene.act ?? ""))) &&
      withinDateRange(scene.createdAt, filters),
  );
  const filteredWatchLogs = watchLogs.filter(
    (log) =>
      log.userId !== null &&
      filteredUserIds.has(log.userId) &&
      (!filters.act.length || filters.act.includes(String(log.act ?? ""))) &&
      withinDateRange(log.timestamp, filters),
  );
  const completedUserIds = new Set(filteredScenes.map((scene) => scene.userId));
  const completionRate = filteredParticipants.length
    ? (completedUserIds.size / filteredParticipants.length) * 100
    : 0;

  const ageData = countBy(filteredParticipants, (user) => user.age);
  const genderData = countBy(filteredParticipants, (user) => user.gender);
  const schoolData = countBy(filteredParticipants, (user) => user.school);

  const summaryRows = filteredParticipants.map((user) => {
    const userScenes = filteredScenes.filter(
      (scene) => scene.userId === user.userId,
    );
    const userWatchLogs = filteredWatchLogs.filter(
      (log) => log.userId === user.userId,
    );
    const userLoginSessions = new Set(
      userWatchLogs
        .map((log) => log.LoginSession)
        .filter(
          (value): value is number => value !== null && value !== undefined,
        ),
    );
    const userDurations = Array.from(
      actDurationMap(userScenes).values(),
    ).filter((value): value is number => value !== null);
    const userTotalDuration = userDurations.length
      ? userDurations.reduce((sum, d) => sum + d, 0)
      : null;

    return {
      User: participantName(user),
      Age: user.age ?? "",
      Gender: user.gender ?? "",
      School: user.school ?? "",
      "Login Sessions": userLoginSessions.size,
      "Total ACTs": availableActs.length,
      "Play Duration":
        userTotalDuration === null
          ? "-"
          : `${formatNumber(userTotalDuration / 60, 1)} min`,
      "Latest Complete": latestDate(userScenes.map((scene) => scene.createdAt)),
    };
  });

  return (
    <>
      <PageHeader
        title="Game Data"
        description="Completion, demographics, and ACT performance across all participants."
        filters={filters}
        setFilters={setFilters}
        participants={participants}
      />
      <div className="page-body">
        <section className="metric-grid overview-metrics">
          <MetricCard
            label="Participants"
            value={filteredParticipants.length}
            icon={UsersRound}
          />
          <MetricCard
            label="Completed Users"
            value={completedUserIds.size}
            icon={CircleCheckBig}
          />
          <MetricCard
            label="Completion Rate"
            value={formatPercent(completionRate)}
            icon={Gauge}
          />
        </section>
        <section className="dashboard-layout overview-layout">
          <div className="main-stack">
            <section className="overview-visual-grid">
              <BarPanel title="Age Distribution" data={ageData} vertical />
              <DonutPanel title="Gender" data={genderData} icon={UsersRound} />
              <SchoolSummaryPanel data={schoolData} />
            </section>
            <div className="table-heading">
              <h2>Participant Progress Summary</h2>
            </div>
            {!canExport ? (
              <p className="hint">
                Viewer role can view data only. Export is available for admin
                and stuff.
              </p>
            ) : null}
            <DataTable
              rows={summaryRows}
              exportFilename="participant-progress-summary.csv"
              canExport={canExport}
            />
          </div>
        </section>
      </div>
    </>
  );
}
