"use client";

import { Download, Eye, Search, UsersRound, VenusAndMars } from "lucide-react";
import { useMemo, useState } from "react";
import type { Participant, SceneData, WatchLog } from "@/lib/supabase";
import {
  BarPanel,
  sortActs,
  formatActLabel,
  DonutPanel,
  StatPanel,
  PageHeader,
  countBy,
  downloadCsv,
  formatNumber,
  formatPercent,
  latestDate,
  matchesParticipant,
  participantName,
  sceneDuration,
  withinDateRange,
  type Filters,
  MetricCard,
} from "./shared";
import { ParticipantWatchProfile } from "./WatchPage";

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
  const [selectedWatchUserId, setSelectedWatchUserId] = useState<number | null>(
    null,
  );
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
      UserId: user.userId,
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

  if (selectedWatchUserId !== null) {
    return (
      <>
        <PageHeader
          title="Overview"
          description="Participant watch profile and timestamp sensor data."
        />
        <div className="page-body">
          <ParticipantWatchProfile
            participants={participants}
            watchLogs={watchLogs}
            filters={filters}
            selectedUserId={selectedWatchUserId}
            canExport={canExport}
            onBack={() => setSelectedWatchUserId(null)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Completion, demographics, and ACT performance across all participants."
        filters={filters}
        setFilters={setFilters}
        participants={participants}
      />
      <div className="page-body">
        <section className="dashboard-layout overview-layout">
          <div className="main-stack">
            <section className="overview-visual-grid">
              <div
                className="metric-card-wrapper"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <MetricCard
                  label="Participants"
                  value={filteredParticipants.length}
                  icon={UsersRound}
                />
              </div>
              <BarPanel title="Age Distribution" data={ageData} vertical />
              <DonutPanel
                title="Gender"
                data={genderData}
                icon={VenusAndMars}
              />
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
            <ParticipantProgressTable
              rows={summaryRows}
              canExport={canExport}
              onView={setSelectedWatchUserId}
            />
          </div>
        </section>
      </div>
    </>
  );
}

type ParticipantProgressRow = {
  UserId: number;
  User: string;
  Age: number | string;
  Gender: string;
  School: string;
  "Login Sessions": number;
  "Total ACTs": number;
  "Play Duration": string;
  "Latest Complete": string;
};

function ParticipantProgressTable({
  rows,
  canExport,
  onView,
}: {
  rows: ParticipantProgressRow[];
  canExport: boolean;
  onView: (userId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleRows = rows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
  );
  const exportRows = visibleRows.map((row) => ({
    User: row.User,
    Age: row.Age,
    Gender: row.Gender,
    School: row.School,
    "Login Sessions": row["Login Sessions"],
    "Total ACTs": row["Total ACTs"],
    "Play Duration": row["Play Duration"],
    "Latest Complete": row["Latest Complete"],
  }));

  return (
    <section className="table-card">
      <div className="table-action-row">
        <div className="table-tools">
          <Search size={16} />
          <input
            placeholder="Search..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span>{visibleRows.length} rows</span>
        </div>
        <button
          className="secondary-button"
          disabled={!canExport || !visibleRows.length}
          onClick={() =>
            downloadCsv("participant-progress-summary.csv", exportRows)
          }
          type="button"
        >
          <Download size={16} /> Export CSV
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Age</th>
              <th>Gender</th>
              <th>School</th>
              <th>Login Sessions</th>
              <th>Total ACTs</th>
              <th>Play Duration</th>
              <th>Latest Complete</th>
              <th>Watch Data</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <tr key={row.UserId}>
                  <td>{row.User}</td>
                  <td>{row.Age}</td>
                  <td>{row.Gender}</td>
                  <td>{row.School}</td>
                  <td>{row["Login Sessions"]}</td>
                  <td>{row["Total ACTs"]}</td>
                  <td>{row["Play Duration"]}</td>
                  <td>{row["Latest Complete"]}</td>
                  <td>
                    <button
                      className="icon-action-button"
                      onClick={() => onView(row.UserId)}
                      title="View watch data"
                      type="button"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="empty-state">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
