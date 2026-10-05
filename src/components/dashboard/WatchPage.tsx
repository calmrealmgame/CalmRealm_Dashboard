"use client";

import { ArrowLeft, Eye, Search, UsersRound } from "lucide-react";
import { useState } from "react";
import type { Participant, WatchLog } from "@/lib/supabase";
import {
  DataTable,
  sortActs,
  formatActLabel,
  MetricCard,
  PageHeader,
  asNumber,
  average,
  formatNumber,
  formatPercent,
  matchesParticipant,
  participantName,
  withinDateRange,
  type Filters,
} from "./shared";

const DEMOGRAPHIC_SEXES = [
  { key: "female", label: "Female", color: "#f7b4df" },
  { key: "male", label: "Male", color: "#3ba6f2" },
  { key: "other", label: "Others", color: "#d9d9d9" },
] as const;
const SIGNALS = [
  { key: "ppg", label: "PPG avg", decimals: 1 },
  { key: "imu", label: "IMU avg", decimals: 2 },
  { key: "eda", label: "EDA avg", decimals: 2 },
] as const;

type SignalKey = (typeof SIGNALS)[number]["key"];
type SexKey = (typeof DEMOGRAPHIC_SEXES)[number]["key"];
type SignalAverage = Record<SignalKey, number | null>;

type ActSensorSummary = SignalAverage & {
  userId: number;
  user: string;
  age: number | null;
  sex: SexKey;
  act: string;
  duration: number | null;
};

type UserSensorSummary = SignalAverage & {
  userId: number;
  user: string;
  age: number | null;
  sex: SexKey;
  school: string | null;
  playedActs: number;
  totalActs: number;
  completionPercent: number;
  duration: number | null;
  latestSample: string | null;
  latestLoginSession: number | null;
  loginSessionCount: number;
  sampleCount: number;
};

function normalizeSex(value: string | null | undefined): SexKey {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["female", "f", "woman", "girl", "หญิง", "ผู้หญิง"].includes(text))
    return "female";
  if (["male", "m", "man", "boy", "ชาย", "ผู้ชาย"].includes(text))
    return "male";
  return "other";
}

function finiteAverage(values: (number | null)[]) {
  const finiteValues = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return average(finiteValues);
}

function numericLeaves(value: unknown): number[] {
  const direct = asNumber(value);
  if (direct !== null && Number.isFinite(direct)) return [direct];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(
      numericLeaves,
    );
  }
  return [];
}

function imuAverage(value: unknown) {
  return average(numericLeaves(value));
}

function formatSignal(value: number | null, decimals: number) {
  return value === null ? "-" : value.toFixed(decimals);
}

function formatDuration(value: number | null) {
  return value === null ? "-" : `${formatNumber(value, 1)} min`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString()
    : "-";
}

function formatLoginSession(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value;
}

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] ?? current;
    const following = points[index + 2] ?? next;
    commands.push(
      `C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${
        next.x - (following.x - current.x) / 6
      } ${next.y - (following.y - current.y) / 6}, ${next.x} ${next.y}`,
    );
  }
  return commands.join(" ");
}

function watchActsInDataOrder(logs: WatchLog[]) {
  const seen = new Set<string>();
  const acts: string[] = [];
  logs.forEach((log) => {
    const act = formatActLabel(log.act?.trim() || "");
    if (!act || seen.has(act)) return;
    seen.add(act);
    acts.push(act);
  });
  return sortActs(acts);
}

export function WatchPage({
  participants,
  watchLogs,
  filters,
  setFilters,
  canExport,
}: {
  participants: Participant[];
  watchLogs: WatchLog[];
  filters: Filters;
  setFilters: (filters: Filters) => void;
  canExport: boolean;
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const userById = new Map(participants.map((user) => [user.userId, user]));
  const acts = watchActsInDataOrder(watchLogs);

  const filteredLogs = watchLogs.filter((log) => {
    const user = log.userId == null ? undefined : userById.get(log.userId);
    if (!matchesParticipant(user, filters)) return false;
    if (filters.act.length && !filters.act.includes(String(log.act ?? "")))
      return false;
    return withinDateRange(log.timestamp, filters);
  });
  const sensorLogs = watchLogs.filter((log) => {
    const user = log.userId == null ? undefined : userById.get(log.userId);
    if (!matchesParticipant(user, filters)) return false;
    if (filters.act.length && !filters.act.includes(String(log.act ?? "")))
      return false;
    return withinDateRange(log.timestamp, filters);
  });

  const sensorSummary = buildActSensorSummary(participants, sensorLogs, acts);
  const watchParticipants = new Set(
    filteredLogs.map((log) => log.userId).filter(Boolean),
  );
  const selectedUser =
    selectedUserId === null
      ? null
      : (sensorSummary.userSummaries.find(
          (summary) => summary.userId === selectedUserId,
        ) ?? null);

  const selectedUserSamples =
    selectedUserId === null
      ? []
      : buildWatchSampleRows(filteredLogs, userById, selectedUserId);
  const selectedUserActSummaries =
    selectedUserId === null
      ? []
      : sensorSummary.summaries.filter(
          (summary) => summary.userId === selectedUserId,
        );

  return (
    <>
      <PageHeader
        title="Watch Data"
        description="Watch records grouped by ACT, participant, and physiological signal."
        filters={filters}
        setFilters={setFilters}
        participants={participants}
      />
      <div className="page-body">
        {selectedUser ? (
          <>
            <button
              className="back-button"
              onClick={() => setSelectedUserId(null)}
              type="button"
            >
              <ArrowLeft size={16} />
              Back to Watch Summary
            </button>
            <section className="participant-detail-hero">
              <div>
                <span>Participant</span>
                <strong>{selectedUser.user}</strong>
                <small>
                  {selectedUser.age ?? "-"} years ·{" "}
                  {DEMOGRAPHIC_SEXES.find((sex) => sex.key === selectedUser.sex)
                    ?.label ?? selectedUser.sex}
                  {selectedUser.school ? ` · ${selectedUser.school}` : ""}
                </small>
              </div>
            </section>
            <section className="dashboard-layout overview-layout">
              <div className="main-stack">
                <div className="table-heading secondary-heading">
                  <div>
                    <h2>Sensor Summary</h2>
                    <p>PPG, EDA, and IMU trends for this participant only.</p>
                  </div>
                </div>
                <ActSensorCharts summaries={selectedUserActSummaries} />
                <div className="table-heading">
                  <h2>Watch Samples</h2>
                </div>
                {!canExport ? (
                  <p className="hint">
                    Viewer role can view data only. Export is available for
                    admin and stuff.
                  </p>
                ) : null}
                <DataTable
                  rows={selectedUserSamples}
                  exportFilename={`watch-samples-${selectedUser.userId}.csv`}
                  canExport={canExport}
                />
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="metric-grid watch-metrics">
              <MetricCard
                label="Watch Participants"
                value={watchParticipants.size}
                icon={UsersRound}
              />
            </section>
            <div className="table-heading watch-summary-heading">
              <div>
                <h2>Watch Summary</h2>
                <p>
                  One participant per row. Select a participant to view personal
                  progress, sensor charts, and samples.
                </p>
              </div>
            </div>
            <WatchSummaryTable
              summaries={sensorSummary.userSummaries}
              onSelect={setSelectedUserId}
            />
          </>
        )}
      </div>
    </>
  );
}

function buildSummaryTableRow(summary: UserSensorSummary) {
  return {
    User: summary.user,
    Age: summary.age ?? "",
    School: summary.school ?? "",
    "Login Sessions": summary.loginSessionCount,
    "Avg PPG": formatSignal(summary.ppg, 1),
    "Avg EDA": formatSignal(summary.eda, 2),
    "Avg IMU": formatSignal(summary.imu, 2),
  };
}

function buildWatchSampleRows(
  logs: WatchLog[],
  userById: Map<number, Participant>,
  selectedUserId?: number,
) {
  return logs
    .filter(
      (log) => selectedUserId === undefined || log.userId === selectedUserId,
    )
    .map((log) => {
      const user = log.userId == null ? undefined : userById.get(log.userId);
      return {
        Name: user ? participantName(user) : (log.userId ?? ""),
        Age: user?.age ?? "",
        Gender: user?.gender ?? "",
        School: user?.school ?? "",
        ACT: formatActLabel(log.act ?? ""),
        PPG: log.PPG ?? "",
        EDA: log.EDA ?? "",
        IMU: asNumber(log.IMU) ?? JSON.stringify(log.IMU ?? ""),
        "Time Stamps": formatTimestamp(log.timestamp),
      };
    });
}

function WatchSummaryTable({
  summaries,
  onSelect,
}: {
  summaries: UserSensorSummary[];
  onSelect: (userId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleSummaries = summaries.filter((summary) =>
    JSON.stringify(buildSummaryTableRow(summary))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <section className="table-card watch-summary-table">
      <div className="table-action-row">
        <div className="table-tools">
          <Search size={16} />
          <input
            placeholder="Search..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span>{visibleSummaries.length} rows</span>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Age</th>
              <th>School</th>
              <th>Login Sessions</th>
              <th>Avg PPG</th>
              <th>Avg EDA</th>
              <th>Avg IMU</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {visibleSummaries.length ? (
              visibleSummaries.map((summary) => {
                const row = buildSummaryTableRow(summary);
                return (
                  <tr key={summary.userId}>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => onSelect(summary.userId)}
                        type="button"
                      >
                        {row.User}
                      </button>
                    </td>
                    <td>{row.Age}</td>
                    <td>{row.School}</td>
                    <td>{row["Login Sessions"]}</td>
                    <td>{row["Avg PPG"]}</td>
                    <td>{row["Avg EDA"]}</td>
                    <td>{row["Avg IMU"]}</td>
                    <td>
                      <button
                        className="icon-action-button"
                        onClick={() => onSelect(summary.userId)}
                        title="View participant"
                        type="button"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="empty-state">
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

function buildActSensorSummary(
  participants: Participant[],
  logs: WatchLog[],
  allActs: string[],
) {
  const userById = new Map(participants.map((user) => [user.userId, user]));
  const logsByUserAct = new Map<string, WatchLog[]>();
  const logsByUser = new Map<number, WatchLog[]>();
  const warnings = new Set<string>();
  let missingAgeCount = 0;
  let imuComplexCount = 0;

  logs.forEach((log) => {
    if (log.userId == null) return;
    const user = userById.get(log.userId);
    if (!user) return;
    if (user.age == null) {
      missingAgeCount += 1;
    }
    if (
      Array.isArray(log.IMU) ||
      (log.IMU && typeof log.IMU === "object" && asNumber(log.IMU) === null)
    ) {
      imuComplexCount += 1;
    }
    const act = log.act?.trim() || "Unknown";
    const key = `${log.userId}:${act}`;
    logsByUserAct.set(key, [...(logsByUserAct.get(key) ?? []), log]);
    logsByUser.set(log.userId, [...(logsByUser.get(log.userId) ?? []), log]);
  });

  if (missingAgeCount)
    warnings.add(
      `พบ log ${missingAgeCount} รายการที่ไม่มีอายุ แต่ยังนำค่า sensor ไปคำนวณในกลุ่มอายุ All`,
    );
  if (imuComplexCount)
    warnings.add(
      `พบ IMU แบบ object/array ${imuComplexCount} รายการ จึงใช้ค่าเฉลี่ยของตัวเลขภายในรายการนั้น`,
    );

  const summaries: ActSensorSummary[] = Array.from(
    logsByUserAct,
    ([key, userLogs]) => {
      const [userIdText, ...actParts] = key.split(":");
      const userId = Number(userIdText);
      const act = actParts.join(":");
      const user = userById.get(userId);
      return {
        userId,
        user: participantName(user),
        age: user?.age ?? null,
        sex: normalizeSex(user?.gender),
        act,
        duration: estimateGroupAverageDurationValue(userLogs),
        ppg: finiteAverage(userLogs.map((log) => asNumber(log.PPG))),
        eda: finiteAverage(userLogs.map((log) => asNumber(log.EDA))),
        imu: finiteAverage(userLogs.map((log) => imuAverage(log.IMU))),
      };
    },
  );

  const userSummaries: UserSensorSummary[] = Array.from(
    logsByUser,
    ([userId, userLogs]) => {
      const user = userById.get(userId);
      const playedActs = new Set(
        userLogs.map((log) => log.act?.trim()).filter(Boolean),
      ).size;
      const loginSessions = new Set(
        userLogs
          .map((log) => log.LoginSession)
          .filter(
            (value): value is number => value !== null && value !== undefined,
          ),
      );
      const latestLog = [...userLogs].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      })[0];
      const latestSample =
        userLogs
          .map((log) => log.timestamp)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
        null;
      return {
        userId,
        user: participantName(user),
        age: user?.age ?? null,
        sex: normalizeSex(user?.gender),
        school: user?.school ?? null,
        playedActs,
        totalActs: allActs.length,
        completionPercent: allActs.length
          ? (playedActs / allActs.length) * 100
          : 0,
        duration: estimateGroupAverageDurationValue(userLogs),
        latestSample,
        latestLoginSession: latestLog?.LoginSession ?? null,
        loginSessionCount: loginSessions.size,
        sampleCount: userLogs.length,
        ppg: finiteAverage(userLogs.map((log) => asNumber(log.PPG))),
        imu: finiteAverage(userLogs.map((log) => imuAverage(log.IMU))),
        eda: finiteAverage(userLogs.map((log) => asNumber(log.EDA))),
      };
    },
  );

  const rows = userSummaries
    .sort((a, b) => a.user.localeCompare(b.user, undefined, { numeric: true }))
    .map((summary) => ({
      User: summary.user,
      Age: summary.age ?? "",
      Gender:
        DEMOGRAPHIC_SEXES.find((sex) => sex.key === summary.sex)?.label ??
        summary.sex,
      School: summary.school ?? "",
      "Login Sessions": summary.loginSessionCount,
      "Play Duration": formatDuration(summary.duration),
      "Completed Data": formatPercent(summary.completionPercent),
      Status:
        summary.totalActs > 0 && summary.playedActs >= summary.totalActs
          ? "Complete"
          : "Incomplete",
      "Avg PPG": formatSignal(summary.ppg, 1),
      "Avg IMU": formatSignal(summary.imu, 2),
      "Avg EDA": formatSignal(summary.eda, 2),
      "Watch Samples": summary.sampleCount,
      "Latest Session": formatLoginSession(summary.latestLoginSession),
      "Latest Sample": formatTimestamp(summary.latestSample),
    }));

  if (!rows.length) warnings.add("ไม่พบข้อมูล sensor สำหรับสร้างตารางสรุป");

  return { summaries, userSummaries, rows, warnings: Array.from(warnings) };
}

function estimateGroupAverageDurationValue(logs: WatchLog[]) {
  const times = logs
    .map((log) =>
      log.timestamp ? new Date(log.timestamp).getTime() : Number.NaN,
    )
    .filter(Number.isFinite);
  if (times.length < 2) return null;
  const duration = (Math.max(...times) - Math.min(...times)) / 60000;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

type ActChartStats = {
  act: string;
  n: number;
  min: number | null;
  avg: number | null;
  max: number | null;
};

const STAT_LINES = [
  { key: "max", label: "MAX", color: "#ff9333" },
  { key: "avg", label: "AVG", color: "#3da5ff" },
  { key: "min", label: "MIN", color: "#57d66d" },
] as const;

function aggregateActStats(
  summaries: ActSensorSummary[],
  signalKey: SignalKey,
) {
  const filtered = summaries;
  const acts = sortActs(
    Array.from(new Set(filtered.map((summary) => summary.act))),
  );

  const points = acts.map((act) => {
    const values = filtered
      .filter((summary) => summary.act === act)
      .map((summary) => summary[signalKey])
      .filter((value): value is number => value !== null);
    return {
      act,
      n: values.length,
      min: values.length ? Math.min(...values) : null,
      avg: average(values),
      max: values.length ? Math.max(...values) : null,
    };
  });

  return { acts, points, filtered };
}

function signalDomain(points: ActChartStats[]) {
  const values = points
    .flatMap((point) => [point.min, point.avg, point.max])
    .filter((value): value is number => value !== null);
  if (!values.length) return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const min = Math.max(0, rawMin - range * 0.12);
  const max = rawMax + range * 0.18;

  return {
    min,
    max,
    ticks: Array.from(
      { length: 5 },
      (_, index) => min + ((max - min) / 4) * index,
    ),
  };
}

function ActSensorCharts({
  summaries,
  compact = false,
}: {
  summaries: ActSensorSummary[];
  compact?: boolean;
}) {
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    point: ActChartStats;
    signal: (typeof SIGNALS)[number];
    stat: (typeof STAT_LINES)[number];
  } | null>(null);
  const height = compact ? 260 : 310;
  const chartWidth = compact ? 680 : 1180;
  const padding = compact
    ? { top: 18, right: 20, bottom: 62, left: 42 }
    : { top: 22, right: 24, bottom: 72, left: 44 };
  const innerHeight = height - padding.top - padding.bottom;

  return (
    <section
      className={compact ? "act-sensor-panel compact" : "act-sensor-panel"}
    >
      <div className="act-sensor-toolbar">
        <div className="act-sensor-legend" aria-label="คำอธิบายกราฟ">
          {STAT_LINES.map((line) => (
            <span key={line.key}>
              <b style={{ borderTopColor: line.color }} />
              {line.label}
            </span>
          ))}
          <span>
            <em />
            Minigames
          </span>
        </div>
      </div>
      <div className="act-sensor-strip">
        {SIGNALS.map((signal) => {
          const { acts, points } = aggregateActStats(summaries, signal.key);
          const domain = signalDomain(points);
          const chartInnerWidth = chartWidth - padding.left - padding.right;
          const chartStep = acts.length
            ? chartInnerWidth / acts.length
            : chartInnerWidth;
          const xForChartAct = (index: number) =>
            padding.left + chartStep * index + chartStep / 2;
          const yForValue = (value: number) =>
            padding.top +
            (domain.max - value) *
              (innerHeight / (domain.max - domain.min || 1));

          return (
            <article className="act-sensor-chart" key={signal.key}>
              <h3>{signal.label.replace(" avg", "")}</h3>
              <div className="demographic-svg-wrap">
                <svg
                  viewBox={`0 0 ${chartWidth} ${height}`}
                  role="img"
                  aria-label={`กราฟ ${signal.label}`}
                  style={
                    compact
                      ? { width: "100%", height }
                      : { minWidth: chartWidth, width: chartWidth, height }
                  }
                >
                  {domain.ticks.map((tick) => {
                    const y = yForValue(tick);
                    return (
                      <g key={tick.toFixed(4)}>
                        <line
                          className="chart-grid-line"
                          x1={padding.left}
                          x2={chartWidth - padding.right}
                          y1={y}
                          y2={y}
                        />
                        <text
                          className="chart-y-label"
                          x={padding.left - 8}
                          y={y + 4}
                          textAnchor="end"
                        >
                          {tick.toFixed(signal.decimals)}
                        </text>
                      </g>
                    );
                  })}
                  <line
                    className="chart-axis-line"
                    x1={padding.left}
                    x2={padding.left}
                    y1={padding.top}
                    y2={height - padding.bottom}
                  />
                  <line
                    className="chart-axis-line"
                    x1={padding.left}
                    x2={chartWidth - padding.right}
                    y1={height - padding.bottom}
                    y2={height - padding.bottom}
                  />
                  {acts.map((act, index) => {
                    const x = xForChartAct(index);
                    return (
                      <g key={act}>
                        <text
                          className="chart-x-label"
                          x={x}
                          y={height - 22}
                          textAnchor="middle"
                        >
                          {formatActLabel(act)}
                        </text>
                      </g>
                    );
                  })}
                  {acts.map((act, index) => {
                    const x = xForChartAct(index);
                    return act.toLowerCase().includes("minigame") ? (
                      <line
                        key={`mg-${act}`}
                        className="act-minigame-line"
                        x1={x}
                        x2={x}
                        y1={padding.top}
                        y2={height - padding.bottom}
                      />
                    ) : null;
                  })}
                  {STAT_LINES.map((line) => {
                    const drawable = points
                      .map((point, index) => {
                        const value = point[line.key];
                        return value === null
                          ? null
                          : {
                              point,
                              x: xForChartAct(index),
                              y: yForValue(value),
                              value,
                            };
                      })
                      .filter(
                        (
                          item,
                        ): item is {
                          point: ActChartStats;
                          x: number;
                          y: number;
                          value: number;
                        } => item !== null,
                      );
                    return (
                      <g key={line.key}>
                        <path
                          className="act-stat-line"
                          d={smoothPath(drawable)}
                          fill="none"
                          stroke={line.color}
                        />
                        {drawable.map(({ point, x, y }) => (
                          <circle
                            className="act-stat-dot"
                            key={`${signal.key}-${line.key}-${point.act}`}
                            cx={x}
                            cy={y}
                            r={4}
                            fill={line.color}
                            stroke={line.color}
                            onMouseEnter={(event) =>
                              setTooltip({
                                left: event.currentTarget.getBoundingClientRect()
                                  .left,
                                top: event.currentTarget.getBoundingClientRect()
                                  .top,
                                point,
                                signal,
                                stat: line,
                              })
                            }
                            onMouseLeave={() => setTooltip(null)}
                          />
                        ))}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </article>
          );
        })}
      </div>
      {tooltip ? (
        <div
          className="chart-tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <strong>
            {tooltip.point.act} - {tooltip.stat.label} (n={tooltip.point.n})
          </strong>
          <span>
            <i style={{ background: tooltip.stat.color }} />
            {tooltip.signal.label}:{" "}
            {formatSignal(
              tooltip.point[tooltip.stat.key],
              tooltip.signal.decimals,
            )}
          </span>
        </div>
      ) : null}
    </section>
  );
}
