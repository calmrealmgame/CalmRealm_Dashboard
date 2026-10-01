"use client";

import { UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { Participant, WatchLog } from "@/lib/supabase";
import {
  DataTable,
  MetricCard,
  PageHeader,
  asNumber,
  average,
  matchesParticipant,
  participantName,
  uniqueValues,
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
};

function normalizeSex(value: string | null | undefined): SexKey {
  const text = String(value ?? "").trim().toLowerCase();
  if (["female", "f", "woman", "girl", "หญิง", "ผู้หญิง"].includes(text)) return "female";
  if (["male", "m", "man", "boy", "ชาย", "ผู้ชาย"].includes(text)) return "male";
  return "other";
}

function finiteAverage(values: (number | null)[]) {
  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return average(finiteValues);
}

function numericLeaves(value: unknown): number[] {
  const direct = asNumber(value);
  if (direct !== null && Number.isFinite(direct)) return [direct];
  if (Array.isArray(value)) return value.flatMap(numericLeaves);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(numericLeaves);
  }
  return [];
}

function imuAverage(value: unknown) {
  return average(numericLeaves(value));
}

function formatSignal(value: number | null, decimals: number) {
  return value === null ? "-" : value.toFixed(decimals);
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
      `C ${current.x + (next.x - previous.x) / 6} ${current.y + (next.y - previous.y) / 6}, ${next.x - (following.x - current.x) / 6
      } ${next.y - (following.y - current.y) / 6}, ${next.x} ${next.y}`,
    );
  }
  return commands.join(" ");
}

function sortActs(values: string[]) {
  const preferred = ["minigame1", "act1", "minigame2", "act2", "minigame3", "act3", "act4", "minigame4", "act5", "act6"];
  const orderOf = (value: string) => {
    const normalized = value.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
    const preferredIndex = preferred.indexOf(normalized);
    return preferredIndex === -1 ? Number.MAX_SAFE_INTEGER : preferredIndex;
  };

  return [...values].sort((a, b) => {
    const orderA = orderOf(a);
    const orderB = orderOf(b);
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function formatActLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
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
  const userById = new Map(participants.map((user) => [user.userId, user]));
  const acts = uniqueValues(watchLogs, (log) => log.act);

  const completeDataUserIds = useMemo(() => {
    const set = new Set<number>();
    if (!acts.length) return set;
    const userActsMap = new Map<number, Set<string>>();
    watchLogs.forEach((log) => {
      if (log.userId !== null && log.act) {
        const userActs = userActsMap.get(log.userId) ?? new Set<string>();
        userActs.add(log.act);
        userActsMap.set(log.userId, userActs);
      }
    });
    userActsMap.forEach((actsSet, userId) => {
      if (actsSet.size >= acts.length) {
        set.add(userId);
      }
    });
    return set;
  }, [watchLogs, acts]);

  const filteredLogs = watchLogs.filter((log) => {
    const user = log.userId == null ? undefined : userById.get(log.userId);
    if (!matchesParticipant(user, filters, completeDataUserIds)) return false;
    if (filters.act.length && !filters.act.includes(String(log.act ?? ""))) return false;
    return withinDateRange(log.timestamp, filters);
  });
  const sensorLogs = watchLogs.filter((log) => {
    const user = log.userId == null ? undefined : userById.get(log.userId);
    if (!matchesParticipant(user, filters, completeDataUserIds)) return false;
    if (filters.act.length && !filters.act.includes(String(log.act ?? ""))) return false;
    return withinDateRange(log.timestamp, filters);
  });

  const watchParticipants = new Set(filteredLogs.map((log) => log.userId).filter(Boolean));
  const sensorSummary = buildActSensorSummary(participants, sensorLogs, sortActs(acts.map(String)));

  const rows = filteredLogs.map((log) => {
    const user = log.userId == null ? undefined : userById.get(log.userId);
    return {
      Name: user ? `${user.name ?? ""} ${user.lastname ?? ""}`.trim() || user.email || user.userId : log.userId ?? "",
      Age: user?.age ?? "",
      Gender: user?.gender ?? "",
      School: user?.school ?? "",
      ACT: log.act ?? "",
      PPG: log.PPG ?? "",
      EDA: log.EDA ?? "",
      IMU: asNumber(log.IMU) ?? JSON.stringify(log.IMU ?? ""),
      // "emotion value": log.emotionValue ?? "",
      "Time Stamps": log.timestamp ? new Date(log.timestamp).toLocaleString() : "",
    };
  });

  return (
    <>
      <PageHeader
        title="Watch Data"
        description="Watch records grouped by ACT, participant, and physiological signal."
        filters={filters}
        setFilters={setFilters}
        participants={participants}
        acts={acts}
        showAct
      />
      <div className="page-body">
        <section className="metric-grid watch-metrics">
          <MetricCard label="Watch Participants" value={watchParticipants.size} icon={UsersRound} />
        </section>
        <section className="dashboard-layout overview-layout">
          <div className="main-stack">
            <div className="table-heading secondary-heading">
              <div>
                <h2>Sensor Summary</h2>
                <p> Shows sensor trends across each activity, including Min, Avg, and Max values
                  for PPG, EDA, and IMU. </p>
              </div>
            </div>
            {/* {sensorSummary.warnings.length ? (
              // <div className="data-warning-list">
              //   {sensorSummary.warnings.map((warning) => (
              //     <p key={warning}>{warning}</p>
              //   ))}
              // </div>
            ) : null} */}
            {/* <DataTable rows={sensorSummary.rows} /> */}
            <ActSensorCharts summaries={sensorSummary.summaries} />
            <div className="table-heading secondary-heading">
              <h2>Watch Samples</h2>
            </div>
            {!canExport ? <p className="hint">Admin role can view data only. Export is available for super admin.</p> : null}
            <DataTable rows={rows} exportFilename="watch-data.csv" canExport={canExport} />
          </div>
        </section>
      </div>
    </>
  );
}

function buildActSensorSummary(participants: Participant[], logs: WatchLog[], allActs: string[]) {
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
    if (Array.isArray(log.IMU) || (log.IMU && typeof log.IMU === "object" && asNumber(log.IMU) === null)) {
      imuComplexCount += 1;
    }
    const act = log.act?.trim() || "Unknown";
    const key = `${log.userId}:${act}`;
    logsByUserAct.set(key, [...(logsByUserAct.get(key) ?? []), log]);
    logsByUser.set(log.userId, [...(logsByUser.get(log.userId) ?? []), log]);
  });

  if (missingAgeCount) warnings.add(`พบ log ${missingAgeCount} รายการที่ไม่มีอายุ แต่ยังนำค่า sensor ไปคำนวณในกลุ่มอายุ All`);
  if (imuComplexCount) warnings.add(`พบ IMU แบบ object/array ${imuComplexCount} รายการ จึงใช้ค่าเฉลี่ยของตัวเลขภายในรายการนั้น`);

  const summaries: ActSensorSummary[] = Array.from(logsByUserAct, ([key, userLogs]) => {
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
  });

  const userSummaries: UserSensorSummary[] = Array.from(logsByUser, ([userId, userLogs]) => {
    const user = userById.get(userId);
    const playedActs = new Set(userLogs.map((log) => log.act?.trim()).filter(Boolean)).size;
    return {
      userId,
      user: participantName(user),
      age: user?.age ?? null,
      sex: normalizeSex(user?.gender),
      school: user?.school ?? null,
      playedActs,
      totalActs: allActs.length,
      completionPercent: allActs.length ? (playedActs / allActs.length) * 100 : 0,
      duration: estimateGroupAverageDurationValue(userLogs),
      ppg: finiteAverage(userLogs.map((log) => asNumber(log.PPG))),
      imu: finiteAverage(userLogs.map((log) => imuAverage(log.IMU))),
      eda: finiteAverage(userLogs.map((log) => asNumber(log.EDA))),
    };
  });

  const rows = userSummaries
    .sort((a, b) => a.user.localeCompare(b.user, undefined, { numeric: true }))
    .map((summary) => ({
      User: summary.user,
      Age: summary.age ?? "",
      Gender: DEMOGRAPHIC_SEXES.find((sex) => sex.key === summary.sex)?.label ?? summary.sex,
      School: summary.school ?? "",
      "Play Duration": summary.duration === null ? "-" : `${summary.duration.toFixed(1)} min`,
      "Completed Data": `${summary.completionPercent.toFixed(0)}%`,
      Status: summary.totalActs > 0 && summary.playedActs >= summary.totalActs ? "Complete" : "Incomplete",
      "Avg PPG": formatSignal(summary.ppg, 1),
      "Avg IMU": formatSignal(summary.imu, 2),
      "Avg EDA": formatSignal(summary.eda, 2),
    }));

  if (!rows.length) warnings.add("ไม่พบข้อมูล sensor สำหรับสร้างตารางสรุป");

  return { summaries, rows, warnings: Array.from(warnings) };
}

function estimateGroupAverageDurationValue(logs: WatchLog[]) {
  const times = logs
    .map((log) => (log.timestamp ? new Date(log.timestamp).getTime() : Number.NaN))
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

function aggregateActStats(summaries: ActSensorSummary[], signalKey: SignalKey) {
  const filtered = summaries;
  const acts = sortActs(Array.from(new Set(filtered.map((summary) => summary.act))));

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
  const values = points.flatMap((point) => [point.min, point.avg, point.max]).filter((value): value is number => value !== null);
  if (!values.length) return { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const min = Math.max(0, rawMin - range * 0.12);
  const max = rawMax + range * 0.18;

  return {
    min,
    max,
    ticks: Array.from({ length: 5 }, (_, index) => min + ((max - min) / 4) * index),
  };
}

function ActSensorCharts({ summaries }: { summaries: ActSensorSummary[] }) {
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    point: ActChartStats;
    signal: (typeof SIGNALS)[number];
    stat: (typeof STAT_LINES)[number];
  } | null>(null);
  const height = 310;
  const chartWidth = 1180;
  const padding = { top: 22, right: 24, bottom: 72, left: 44 };
  const innerHeight = height - padding.top - padding.bottom;

  return (
    <section className="act-sensor-panel">
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
          const chartStep = acts.length ? chartInnerWidth / acts.length : chartInnerWidth;
          const xForChartAct = (index: number) => padding.left + chartStep * index + chartStep / 2;
          const yForValue = (value: number) =>
            padding.top + (domain.max - value) * (innerHeight / (domain.max - domain.min || 1));

          return (
            <article className="act-sensor-chart" key={signal.key}>
              <h3>{signal.label.replace(" avg", "")}</h3>
              <div className="demographic-svg-wrap">
                <svg viewBox={`0 0 ${chartWidth} ${height}`} role="img" aria-label={`กราฟ ${signal.label}`} style={{ minWidth: chartWidth }}>
                  {domain.ticks.map((tick) => {
                    const y = yForValue(tick);
                    return (
                      <g key={tick.toFixed(4)}>
                        <line className="chart-grid-line" x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
                        <text className="chart-y-label" x={padding.left - 8} y={y + 4} textAnchor="end">
                          {tick.toFixed(signal.decimals)}
                        </text>
                      </g>
                    );
                  })}
                  <line className="chart-axis-line" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
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
                        <text className="chart-x-label" x={x} y={height - 22} textAnchor="middle">
                          {formatActLabel(act)}
                        </text>
                      </g>
                    );
                  })}
                  {acts.map((act, index) => {
                    const x = xForChartAct(index);
                    return act.toLowerCase().includes("minigame") ? (
                      <line key={`mg-${act}`} className="act-minigame-line" x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} />
                    ) : null;
                  })}
                  {STAT_LINES.map((line) => {
                    const drawable = points
                      .map((point, index) => {
                        const value = point[line.key];
                        return value === null ? null : { point, x: xForChartAct(index), y: yForValue(value), value };
                      })
                      .filter((item): item is { point: ActChartStats; x: number; y: number; value: number } => item !== null);
                    return (
                      <g key={line.key}>
                        <path className="act-stat-line" d={smoothPath(drawable)} fill="none" stroke={line.color} />
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
                                left: event.currentTarget.getBoundingClientRect().left,
                                top: event.currentTarget.getBoundingClientRect().top,
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
        <div className="chart-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          <strong>{tooltip.point.act} - {tooltip.stat.label} (n={tooltip.point.n})</strong>
          <span>
            <i style={{ background: tooltip.stat.color }} />
            {tooltip.signal.label}: {formatSignal(tooltip.point[tooltip.stat.key], tooltip.signal.decimals)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
