"use client";

import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import type { Participant, WatchLog } from "@/lib/supabase";
import {
  DataTable,
  sortActs,
  formatActLabel,
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
type SignalKey = "ppg" | "imu" | "eda";
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
  const timestamp = timestampMs(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString()
    : "-";
}

function timestampMs(value: string | null | undefined) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
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

export function ParticipantWatchProfile({
  participants,
  watchLogs,
  filters,
  selectedUserId,
  canExport,
  onBack,
}: {
  participants: Participant[];
  watchLogs: WatchLog[];
  filters: Filters;
  selectedUserId: number;
  canExport: boolean;
  onBack: () => void;
}) {
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
  const selectedUser =
    sensorSummary.userSummaries.find(
      (summary) => summary.userId === selectedUserId,
    ) ?? buildEmptyUserSensorSummary(userById.get(selectedUserId), acts.length);
  const selectedUserLogs = filteredLogs
    .filter((log) => log.userId === selectedUserId)
    .sort((a, b) => timestampMs(a.timestamp) - timestampMs(b.timestamp));
  const selectedUserSamples = buildWatchSampleRows(
    filteredLogs,
    userById,
    selectedUserId,
  );

  return (
    <>
      <button className="back-button" onClick={onBack} type="button">
        <ArrowLeft size={16} />
        Back to Overview
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
              <p>Timestamp trends by login session for this participant.</p>
            </div>
          </div>
          <SensorTimelinePanel logs={selectedUserLogs} />
          <div className="table-heading">
            <h2>Watch Samples</h2>
          </div>
          {!canExport ? (
            <p className="hint">
              Viewer role can view data only. Export is available for admin and
              stuff.
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
  );
}

function buildEmptyUserSensorSummary(
  user: Participant | undefined,
  totalActs: number,
): UserSensorSummary {
  return {
    userId: user?.userId ?? 0,
    user: participantName(user),
    age: user?.age ?? null,
    sex: normalizeSex(user?.gender),
    school: user?.school ?? null,
    playedActs: 0,
    totalActs,
    completionPercent: 0,
    duration: null,
    latestSample: null,
    latestLoginSession: null,
    loginSessionCount: 0,
    sampleCount: 0,
    ppg: null,
    imu: null,
    eda: null,
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
        "Login Session": log.LoginSession ?? "",
        ACT: formatActLabel(log.act ?? ""),
        HRV: formatSignal(readMetricValue(log, "hrv"), 1),
        PPG: log.PPG ?? "",
        EDA: log.EDA ?? "",
        IMU: asNumber(log.IMU) ?? JSON.stringify(log.IMU ?? ""),
        Class: formatClassValue(readMetricValue(log, "class")),
        "Time Stamps": formatTimestamp(log.timestamp),
      };
    });
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

type TimelineMetric = {
  key: "hrv" | "ppg" | "eda" | "imu" | "class";
  label: string;
  unit: string;
  color: string;
  kind: "line" | "movement" | "class";
  decimals: number;
};

type ChartTooltip = {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
};

const TIMELINE_METRICS: TimelineMetric[] = [
  {
    key: "hrv",
    label: "HRV (RMSSD)",
    unit: "ms",
    color: "#39a866",
    kind: "line",
    decimals: 1,
  },
  {
    key: "ppg",
    label: "PPG",
    unit: "BPM",
    color: "#2f6fbd",
    kind: "line",
    decimals: 1,
  },
  {
    key: "eda",
    label: "Electrodermal Activity (EDA)",
    unit: "µS",
    color: "#9b5bd6",
    kind: "line",
    decimals: 2,
  },
  {
    key: "imu",
    label: "Movement (Accelerometer)",
    unit: "Low / Medium / High",
    color: "#f59e0b",
    kind: "movement",
    decimals: 2,
  },
  {
    key: "class",
    label: "ESM (ระดับอารมณ์)",
    unit: "Emotion 1-5",
    color: "#ef4444",
    kind: "class",
    decimals: 0,
  },
];

const MOVEMENT_LEVELS = [
  { label: "High", color: "#ef4444" },
  { label: "Medium", color: "#f59e0b" },
  { label: "Low", color: "#2f6fbd" },
] as const;

const EMOTION_LEVELS = [
  { value: 1, label: "สนุก", color: "#2f6fbd" },
  { value: 2, label: "ดี", color: "#39a866" },
  { value: 3, label: "ปกติ", color: "#a3a3a3" },
  { value: 4, label: "ไม่ดี", color: "#ef4444" },
  { value: 5, label: "ไม่มีเกม", color: "#991b1b" },
] as const;

function readMetricValue(log: WatchLog, metric: TimelineMetric["key"]) {
  const finite = (value: number | null) =>
    value !== null && Number.isFinite(value) ? value : null;
  if (metric === "ppg") return finite(asNumber(log.PPG));
  if (metric === "eda") return finite(asNumber(log.EDA));
  if (metric === "imu") return finite(imuAverage(log.IMU));
  if (metric === "hrv") {
    return finite(
      asNumber(log.HRV) ??
        asNumber(log.hrv) ??
        asNumber(log.RMSSD) ??
        asNumber(log.rmssd) ??
        asNumber(log.HRV_RMSSD),
    );
  }
  return finite(
    asNumber(log.Class) ?? asNumber(log.class) ?? asNumber(log.emotionValue),
  );
}

function formatClassValue(value: number | null) {
  return value === null ? "-" : Math.max(1, Math.min(5, Math.round(value)));
}

function emotionFromValue(value: number) {
  const classValue = Math.max(1, Math.min(5, Math.round(value)));
  return EMOTION_LEVELS[classValue - 1];
}

function timeLabel(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metricDomain(values: number[], metric: TimelineMetric) {
  if (metric.key === "class") return { min: 1, max: 5, ticks: [1, 2, 3, 4, 5] };
  if (metric.kind === "movement") {
    const rawMax = values.length ? Math.max(...values) : 1;
    const max = Math.max(rawMax, 1);
    return { min: 0, max, ticks: [max, max / 2, 0] };
  }
  if (!values.length) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.1, 1);
  const min = Math.max(0, rawMin - range * 0.16);
  const max = rawMax + range * 0.2;
  return {
    min,
    max,
    ticks: [min, min + (max - min) / 2, max],
  };
}

function movementColor(value: number, domain: { min: number; max: number }) {
  const ratio = (value - domain.min) / (domain.max - domain.min || 1);
  if (ratio >= 0.67) return MOVEMENT_LEVELS[0].color;
  if (ratio >= 0.34) return MOVEMENT_LEVELS[1].color;
  return MOVEMENT_LEVELS[2].color;
}

function movementLevel(value: number, domain: { min: number; max: number }) {
  const ratio = (value - domain.min) / (domain.max - domain.min || 1);
  if (ratio >= 0.67) return MOVEMENT_LEVELS[0].label;
  if (ratio >= 0.34) return MOVEMENT_LEVELS[1].label;
  return MOVEMENT_LEVELS[2].label;
}

function SensorTimelinePanel({ logs }: { logs: WatchLog[] }) {
  const sessionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          logs
            .map((log) => log.LoginSession)
            .filter(
              (value): value is number => value !== null && value !== undefined,
            ),
        ),
      ).sort((a, b) => a - b),
    [logs],
  );
  const defaultSession = sessionOptions.length ? String(sessionOptions[0]) : "";
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const activeSession =
    selectedSession === null ||
    !sessionOptions.map(String).includes(selectedSession)
      ? defaultSession
      : selectedSession;

  const visibleLogs = logs.filter(
    (log) => String(log.LoginSession ?? "") === activeSession,
  );
  const timedLogs = visibleLogs
    .map((log) => ({ log, time: timestampMs(log.timestamp) }))
    .filter((item): item is { log: WatchLog; time: number } =>
      Number.isFinite(item.time),
    );

  return (
    <section className="sensor-timeline-panel">
      <div className="sensor-timeline-toolbar">
        <label>
          Login session
          <select
            value={activeSession}
            onChange={(event) => setSelectedSession(event.target.value)}
          >
            {sessionOptions.map((value) => (
              <option key={value} value={String(value)}>
                Session {value}
              </option>
            ))}
          </select>
        </label>
        <span>{timedLogs.length} samples</span>
      </div>
      <div className="sensor-timeline-stack">
        {TIMELINE_METRICS.map((metric) => (
          <SensorTimelineChart
            key={metric.key}
            metric={metric}
            points={timedLogs}
          />
        ))}
      </div>
    </section>
  );
}

function SensorTimelineChart({
  metric,
  points,
}: {
  metric: TimelineMetric;
  points: { log: WatchLog; time: number }[];
}) {
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const width = 1180;
  const height = metric.kind === "class" ? 116 : 150;
  const padding = {
    top: 16,
    right: metric.kind === "class" ? 290 : metric.kind === "movement" ? 90 : 22,
    bottom: 42,
    left: metric.kind === "class" ? 68 : 54,
  };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const acts = sortActs(
    Array.from(
      new Set(
        points
          .map((point) => formatActLabel(point.log.act?.trim() || "Unknown"))
          .filter(Boolean),
      ),
    ),
  );
  const values = points
    .map((point) => readMetricValue(point.log, metric.key))
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const domain = metricDomain(values, metric);
  const actStep = acts.length ? innerWidth / acts.length : innerWidth;
  const actTimeRanges = new Map(
    acts.map((act) => {
      const actTimes = points
        .filter(
          (point) => formatActLabel(point.log.act?.trim() || "Unknown") === act,
        )
        .map((point) => point.time);
      return [act, { min: Math.min(...actTimes), max: Math.max(...actTimes) }];
    }),
  );
  const xForActTimestamp = (log: WatchLog, time: number) => {
    const act = formatActLabel(log.act?.trim() || "Unknown");
    const actIndex = Math.max(0, acts.indexOf(act));
    const range = actTimeRanges.get(act);
    const ratio =
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      range.max > range.min
        ? (time - range.min) / (range.max - range.min)
        : 0.5;
    return (
      padding.left +
      actStep * actIndex +
      Math.max(0.12, Math.min(0.88, ratio)) * actStep
    );
  };
  const yForValue = (value: number) =>
    padding.top +
    (domain.max - value) * (innerHeight / (domain.max - domain.min || 1));
  const drawable = points
    .map((point) => {
      const value = readMetricValue(point.log, metric.key);
      return value === null ? null : { ...point, value };
    })
    .filter(
      (point): point is { log: WatchLog; time: number; value: number } =>
        point !== null && Number.isFinite(point.value),
    );
  const path = smoothPath(
    drawable.map((point) => ({
      x: xForActTimestamp(point.log, point.time),
      y: yForValue(point.value),
    })),
  );
  const movementLabels = ["High", "Medium", "Low"];
  const movementBaseY = yForValue(domain.min);
  const barWidth = Math.max(
    2,
    Math.min(5, (actStep || innerWidth) / Math.max(drawable.length, 1) / 1.6),
  );
  const tooltipForPoint = (
    point: { log: WatchLog; time: number; value: number },
    clientX: number,
    clientY: number,
  ) => {
    const act = formatActLabel(point.log.act?.trim() || "Unknown");
    const color =
      metric.kind === "movement"
        ? movementColor(point.value, domain)
        : metric.kind === "class"
          ? emotionFromValue(point.value).color
          : metric.color;
    const metricValue =
      metric.kind === "class"
        ? String(Math.max(1, Math.min(5, Math.round(point.value))))
        : point.value.toFixed(metric.decimals);
    const rows = [
      { label: "ACT", value: act },
      {
        label: metric.kind === "class" ? "Emotion" : "Value",
        value:
          metric.kind === "class"
            ? emotionFromValue(point.value).label
            : metric.kind === "movement"
              ? metricValue
              : `${metricValue} ${metric.unit}`,
        color,
      },
    ];
    if (metric.kind === "class") {
      rows.push({ label: "Value", value: metricValue, color });
    }
    if (metric.kind === "movement") {
      rows.splice(2, 0, {
        label: "Level",
        value: movementLevel(point.value, domain),
        color,
      });
    }
    setTooltip({
      x: clientX,
      y: clientY,
      title: formatTimestamp(point.log.timestamp) || timeLabel(point.time),
      rows,
    });
  };

  return (
    <article className="sensor-timeline-chart">
      <div className="sensor-timeline-title">
        <h3>{metric.label}</h3>
        <span>{metric.unit}</span>
      </div>
      <div className="sensor-timeline-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${metric.label} by timestamp`}
        >
          {domain.ticks.map((tick, index) => {
            const y = yForValue(tick);
            return (
              <g key={`${metric.key}-${index}-${tick}`}>
                <line
                  className="chart-grid-line"
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text
                  className="chart-y-label"
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                >
                  {metric.kind === "movement"
                    ? movementLabels[index]
                    : metric.kind === "class"
                      ? emotionFromValue(tick).label
                      : tick.toFixed(metric.decimals)}
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
            x2={width - padding.right}
            y1={height - padding.bottom}
            y2={height - padding.bottom}
          />
          {acts.map((act, index) => {
            const x = padding.left + actStep * index + actStep / 2;
            const range = actTimeRanges.get(act);
            const label =
              range && Number.isFinite(range.min) && Number.isFinite(range.max)
                ? range.min === range.max
                  ? timeLabel(range.min)
                  : `${timeLabel(range.min)}-${timeLabel(range.max)}`
                : "";
            return (
              <g key={act}>
                <line
                  className="act-minigame-line"
                  x1={x}
                  x2={x}
                  y1={padding.top}
                  y2={height - padding.bottom}
                />
                <text
                  className="chart-x-label"
                  x={x}
                  y={height - 22}
                  textAnchor="middle"
                >
                  {act}
                </text>
                <text
                  className="chart-x-label chart-x-time-label"
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {label}
                </text>
              </g>
            );
          })}
          {metric.kind === "line" ? (
            <>
              <path
                className="sensor-timeline-line"
                d={path}
                fill="none"
                stroke={metric.color}
              />
              {drawable.map((point, index) => (
                <circle
                  key={`${metric.key}-${point.time}-${index}`}
                  cx={xForActTimestamp(point.log, point.time)}
                  cy={yForValue(point.value)}
                  r={2.4}
                  fill={metric.color}
                  onPointerEnter={(event) =>
                    tooltipForPoint(point, event.clientX, event.clientY)
                  }
                  onPointerMove={(event) =>
                    tooltipForPoint(point, event.clientX, event.clientY)
                  }
                  onPointerDown={(event) =>
                    tooltipForPoint(point, event.clientX, event.clientY)
                  }
                  onPointerLeave={() => setTooltip(null)}
                  onPointerUp={() => setTooltip(null)}
                  onPointerCancel={() => setTooltip(null)}
                />
              ))}
            </>
          ) : metric.kind === "movement" ? (
            <>
              {drawable.map((point, index) => {
                const x = xForActTimestamp(point.log, point.time);
                const y = yForValue(point.value);
                return (
                  <rect
                    key={`${metric.key}-${point.time}-${index}`}
                    className="movement-sample-bar"
                    x={x - barWidth / 2}
                    y={Math.min(y, movementBaseY)}
                    width={barWidth}
                    height={Math.max(2, Math.abs(movementBaseY - y))}
                    rx={0.8}
                    fill={movementColor(point.value, domain)}
                    onPointerEnter={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerMove={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerDown={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerLeave={() => setTooltip(null)}
                    onPointerUp={() => setTooltip(null)}
                    onPointerCancel={() => setTooltip(null)}
                  />
                );
              })}
              <g
                className="movement-legend"
                transform={`translate(${width - padding.right + 16} ${padding.top + 4})`}
              >
                {MOVEMENT_LEVELS.map((level, index) => (
                  <g key={level.label} transform={`translate(0 ${index * 18})`}>
                    <rect width={9} height={9} fill={level.color} rx={1} />
                    <text x={14} y={8}>
                      {level.label}
                    </text>
                  </g>
                ))}
              </g>
            </>
          ) : (
            <>
              {drawable.map((point, index) => {
                const emotion = emotionFromValue(point.value);
                return (
                  <circle
                    key={`${metric.key}-${point.time}-${index}`}
                    cx={xForActTimestamp(point.log, point.time)}
                    cy={yForValue(emotion.value)}
                    r={4}
                    fill={emotion.color}
                    onPointerEnter={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerMove={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerDown={(event) =>
                      tooltipForPoint(point, event.clientX, event.clientY)
                    }
                    onPointerLeave={() => setTooltip(null)}
                    onPointerUp={() => setTooltip(null)}
                    onPointerCancel={() => setTooltip(null)}
                  />
                );
              })}
              <g
                className="emotion-legend"
                transform={`translate(${width - padding.right + 16} ${padding.top + 2})`}
              >
                {EMOTION_LEVELS.map((emotion, index) => (
                  <g
                    key={emotion.value}
                    transform={`translate(${index * 54} 0)`}
                  >
                    <circle cx={4} cy={4} r={3.5} fill={emotion.color} />
                    <text x={12} y={8}>
                      {emotion.label}
                    </text>
                  </g>
                ))}
              </g>
            </>
          )}
        </svg>
      </div>
      {tooltip ? (
        <div
          className="chart-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong>{tooltip.title}</strong>
          {tooltip.rows.map((row) => (
            <span key={`${row.label}-${row.value}`}>
              {row.color ? <i style={{ background: row.color }} /> : null}
              {row.label}: {row.value}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
