"use client";

import { CircleCheckBig, Gauge, UsersRound } from "lucide-react";
import { useMemo } from "react";
import type { Participant, SceneData } from "@/lib/supabase";
import {
  BarPanel,
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
  uniqueValues,
  withinDateRange,
  type Filters,
} from "./shared";

function sceneDetailTimestamp(scene: SceneData) {
  const timestamp = scene.details?.timestamp;
  if (typeof timestamp !== "string" || !timestamp.trim()) return null;
  const time = new Date(timestamp.trim().replace(" ", "T")).getTime();
  return Number.isFinite(time) ? time : null;
}

function actPlayDuration(scenes: SceneData[]) {
  const playDurations = scenes.map(sceneDuration).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!playDurations.length) return null;
  return playDurations.reduce((sum, duration) => sum + duration, 0);
}

function actDurationMap(userScenes: SceneData[]) {
  const scenesByAct = new Map<string, SceneData[]>();
  userScenes.forEach((scene) => {
    const act = scene.act ?? "-";
    scenesByAct.set(act, [...(scenesByAct.get(act) ?? []), scene]);
  });

  return new Map(Array.from(scenesByAct, ([act, scenes]) => [act, actPlayDuration(scenes)]));
}

export function OverviewPage({
  participants,
  sceneData,
  filters,
  setFilters,
  canExport,
}: {
  participants: Participant[];
  sceneData: SceneData[];
  filters: Filters;
  setFilters: (filters: Filters) => void;
  canExport: boolean;
}) {
  const availableActs = useMemo(() => uniqueValues(sceneData, (scene) => scene.act), [sceneData]);

  const completeDataUserIds = useMemo(() => {
    const set = new Set<number>();
    if (!availableActs.length) return set;
    const userActsMap = new Map<number, Set<string>>();
    sceneData.forEach((scene) => {
      if (scene.userId !== null && scene.act) {
        const userActs = userActsMap.get(scene.userId) ?? new Set<string>();
        userActs.add(scene.act);
        userActsMap.set(scene.userId, userActs);
      }
    });
    userActsMap.forEach((actsSet, userId) => {
      if (actsSet.size >= availableActs.length) {
        set.add(userId);
      }
    });
    return set;
  }, [sceneData, availableActs]);

  const filteredParticipants = participants.filter((user) => matchesParticipant(user, filters, completeDataUserIds));
  const filteredUserIds = new Set(filteredParticipants.map((user) => user.userId));
  const filteredScenes = sceneData.filter(
    (scene) =>
      scene.userId !== null &&
      filteredUserIds.has(scene.userId) &&
      (!filters.act.length || filters.act.includes(String(scene.act ?? ""))) &&
      withinDateRange(scene.createdAt, filters),
  );
  const completedUserIds = new Set(filteredScenes.map((scene) => scene.userId));
  const completionRate = filteredParticipants.length ? (completedUserIds.size / filteredParticipants.length) * 100 : 0;

  const ageData = countBy(filteredParticipants, (user) => user.age);
  const genderData = countBy(filteredParticipants, (user) => user.gender);
  const schoolData = countBy(filteredParticipants, (user) => user.school);

  const summaryRows = filteredParticipants.map((user) => {
    const userScenes = filteredScenes.filter((scene) => scene.userId === user.userId);
    const userActs = new Set(userScenes.map((scene) => scene.act).filter(Boolean));
    const userDurations = Array.from(actDurationMap(userScenes).values()).filter((value): value is number => value !== null);
    const userTotalDuration = userDurations.length ? userDurations.reduce((sum, d) => sum + d, 0) : null;

    return {
      User: participantName(user),
      Age: user.age ?? "",
      Gender: user.gender ?? "",
      School: user.school ?? "",
      "Total ACTs": availableActs.length,
      "Completion Rate": availableActs.length ? formatPercent((userActs.size / availableActs.length) * 100) : "-",
      "Play Duration": userTotalDuration === null ? "-" : `${formatNumber(userTotalDuration / 60, 1)} min`,
      "Latest Complete": latestDate(userScenes.map((scene) => scene.createdAt)),
    };
  });

  const rows = filteredParticipants.flatMap((user) => {
    const userScenes = filteredScenes
      .filter((scene) => scene.userId === user.userId)
      .sort((a, b) => String(a.act ?? "").localeCompare(String(b.act ?? ""), undefined, { numeric: true }));

    if (!userScenes.length) {
      if (filters.act.length) return [];
      return [
        {
          User: participantName(user),
          Age: user.age ?? "",
          Gender: user.gender ?? "",
          School: user.school ?? "",
          ACT: "-",
          "Play Duration": "-",
          // Score: "-",
          // Ranks: "-",
          // "Completion Rate": "0%",
          "Latest Complete": "-",
        },
      ];
    }

    const scenesByAct = new Map<string, SceneData[]>();
    userScenes.forEach((scene) => {
      const act = scene.act ?? "-";
      scenesByAct.set(act, [...(scenesByAct.get(act) ?? []), scene]);
    });
    const userActDurations = actDurationMap(userScenes);

    return Array.from(scenesByAct, ([act, actScenes]) => {
      const duration = userActDurations.get(act) ?? null;
      const latestScene = [...actScenes].sort((a, b) => {
        const timeA = sceneDetailTimestamp(a) ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = sceneDetailTimestamp(b) ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      })[0];
      return {
        User: participantName(user),
        Age: user.age ?? "",
        Gender: user.gender ?? "",
        School: user.school ?? "",
        ACT: act,
        "Play Duration": duration === null ? "-" : `${formatNumber(duration / 60, 1)} min`,
        // Score: sceneScore(latestScene) ?? "-",
        // Ranks: sceneStars(latestScene) ?? "-",
        // "Completion Rate": availableActs.length
        //   ? formatPercent(
        //     (Array.from(completionKeys).filter((key) => key.startsWith(`${user.userId}:`)).length /
        //       availableActs.length) *
        //     100,
        //   )
        //   : "-",
        "Latest Complete":
          sceneDetailTimestamp(latestScene) !== null
            ? new Date(sceneDetailTimestamp(latestScene) ?? 0).toLocaleString()
            : latestScene.createdAt
              ? new Date(latestScene.createdAt).toLocaleString()
              : "-",
      };
    });
  });

  return (
    <>
      <PageHeader
        title="Dashboard Overview"
        description="Completion, demographics, and ACT performance across all participants."
        filters={filters}
        setFilters={setFilters}
        participants={participants}
        acts={availableActs}
        showAct
      />
      <div className="page-body">
        <section className="metric-grid overview-metrics">
          <MetricCard label="Participants" value={filteredParticipants.length} icon={UsersRound} />
          <MetricCard label="Completed Users" value={completedUserIds.size} icon={CircleCheckBig} />
          <MetricCard label="Completion Rate" value={formatPercent(completionRate)} icon={Gauge} />
        </section>
        <section className="dashboard-layout overview-layout">
          <div className="main-stack">
            <section className="overview-visual-grid">
              <BarPanel title="Age Distribution" data={ageData} vertical />
              <DonutPanel title="Gender" data={genderData} icon={UsersRound} />
              <BarPanel title="School Distribution" data={schoolData} vertical wide />
            </section>
            <div className="table-heading">
              <h2>Participant Progress Summary</h2>
            </div>
            {!canExport ? <p className="hint">Admin role can view data only. Export is available for super admin.</p> : null}
            <DataTable rows={summaryRows} exportFilename="participant-progress-summary.csv" canExport={canExport} />
            <div className="table-heading">
              <h2>Participant Progress</h2>
            </div>
            {!canExport ? <p className="hint">Admin role can view data only. Export is available for super admin.</p> : null}
            <DataTable rows={rows} exportFilename="overview.csv" canExport={canExport} />
          </div>
        </section>
      </div>
    </>
  );
}
