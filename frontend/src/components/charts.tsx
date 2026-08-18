import React, { useState } from "react";
import { View, LayoutChangeEvent, Text as RNText } from "react-native";
import Svg, { Path, Line, Circle, Rect, G, Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function kfmt(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return `${Math.round(n)}`;
}

/* ---------------- Line / Area chart (income vs expense) ---------------- */
export function LineAreaChart({
  labels, income, expense, height = 230,
  incomeColor = "#F26B21", expenseColor = "#2B2F36", gridColor = "#EEE6DE",
  peakIndex = -1, peakTitle = "", peakValue = "",
}: {
  labels: string[]; income: number[]; expense: number[]; height?: number;
  incomeColor?: string; expenseColor?: string; gridColor?: string; peakIndex?: number; peakTitle?: string; peakValue?: string;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const padL = 34, padR = 14, padT = 18, padB = 24;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const maxV = niceMax(Math.max(1, ...income, ...expense));
  const n = labels.length;
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v: number) => padT + plotH - (v / maxV) * plotH;
  const incPts = income.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const expPts = expense.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const incLine = smoothPath(incPts);
  const expLine = smoothPath(expPts);
  const area = incPts.length
    ? `${incLine} L ${xAt(n - 1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`
    : "";
  const grids = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={incomeColor} stopOpacity="0.22" />
              <Stop offset="1" stopColor={incomeColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {grids.map((g, i) => {
            const yy = padT + plotH * g;
            return (
              <G key={i}>
                <Line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke={gridColor} strokeWidth={1} />
                <SvgText x={padL - 8} y={yy + 3} fontSize="9" fill="#9AA1AC" textAnchor="end">
                  {kfmt(maxV * (1 - g))}
                </SvgText>
              </G>
            );
          })}
          {area ? <Path d={area} fill="url(#incFill)" /> : null}
          {expLine ? <Path d={expLine} stroke={expenseColor} strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null}
          {incLine ? <Path d={incLine} stroke={incomeColor} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
          {peakIndex >= 0 && peakIndex < n ? (
            <G>
              <Line x1={xAt(peakIndex)} y1={padT} x2={xAt(peakIndex)} y2={padT + plotH} stroke="#C9CDD3" strokeWidth={1} strokeDasharray="3 3" />
              <Circle cx={xAt(peakIndex)} cy={yAt(income[peakIndex])} r={5} fill={incomeColor} stroke="#fff" strokeWidth={2} />
            </G>
          ) : null}
          {labels.map((l, i) => (
            <SvgText key={i} x={xAt(i)} y={height - 6} fontSize="9.5" fill="#9AA1AC" textAnchor="middle">{l}</SvgText>
          ))}
        </Svg>
      ) : null}
      {peakIndex >= 0 && w > 0 && peakTitle ? (
        <View style={{
          position: "absolute", left: Math.min(Math.max(xAt(peakIndex) - 44, 4), w - 92),
          top: Math.max(yAt(income[peakIndex]) - 44, 2), backgroundColor: "#1F2430",
          borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 84,
        }}>
          <SvgTextless title={peakTitle} value={peakValue} />
        </View>
      ) : null}
    </View>
  );
}

// tiny helper for the tooltip
function SvgTextless({ title, value }: { title: string; value: string }) {
  return (
    <>
      <RNText style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "600" }}>{title}</RNText>
      <RNText style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{value}</RNText>
    </>
  );
}

/* ---------------- Donut chart ---------------- */
export function DonutChart({ data, size = 168, strokeWidth = 26 }: {
  data: { label: string; value: number; color: string }[]; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke="#F1ECE6" strokeWidth={strokeWidth} fill="none" />
        {data.map((d, i) => {
          const len = (d.value / total) * C;
          const seg = (
            <Circle
              key={i} cx={cx} cy={cy} r={r} stroke={d.color} strokeWidth={strokeWidth} fill="none"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} strokeLinecap="butt"
            />
          );
          offset += len;
          return seg;
        })}
      </G>
    </Svg>
  );
}

/* ---------------- Vertical bar chart (orders overview) ---------------- */
export function BarChartWeek({
  labels, values, peakIndex = -1, height = 210,
  barColor = "#FBE2D0", peakColor = "#F26B21", gridColor = "#EEE6DE", tooltipTitle = "", tooltipValue = "",
}: {
  labels: string[]; values: number[]; peakIndex?: number; height?: number;
  barColor?: string; peakColor?: string; gridColor?: string; tooltipTitle?: string; tooltipValue?: string;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const padL = 30, padR = 10, padT = 30, padB = 22;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = height - padT - padB;
  const maxV = niceMax(Math.max(1, ...values));
  const n = labels.length;
  const slot = n ? plotW / n : 0;
  const bw = Math.min(34, slot * 0.5);
  const yAt = (v: number) => padT + plotH - (v / maxV) * plotH;
  const grids = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View onLayout={onLayout} style={{ width: "100%", height }}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {grids.map((g, i) => {
            const yy = padT + plotH * g;
            return (
              <G key={i}>
                <Line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke={gridColor} strokeWidth={1} />
                <SvgText x={padL - 6} y={yy + 3} fontSize="9" fill="#9AA1AC" textAnchor="end">{kfmt(maxV * (1 - g))}</SvgText>
              </G>
            );
          })}
          {values.map((v, i) => {
            const x = padL + slot * i + (slot - bw) / 2;
            const y = yAt(v);
            const h = padT + plotH - y;
            const isPeak = i === peakIndex;
            return <Rect key={i} x={x} y={y} width={bw} height={Math.max(0, h)} rx={6} fill={isPeak ? peakColor : barColor} />;
          })}
          {labels.map((l, i) => (
            <SvgText key={i} x={padL + slot * i + slot / 2} y={height - 6} fontSize="9.5" fill="#9AA1AC" textAnchor="middle">{l}</SvgText>
          ))}
        </Svg>
      ) : null}
      {peakIndex >= 0 && w > 0 && tooltipTitle ? (
        <View style={{
          position: "absolute", left: Math.min(Math.max(padL + slot * peakIndex + slot / 2 - 42, 2), w - 86),
          top: 0, backgroundColor: "#1F2430", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center",
        }}>
          <RNText style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{tooltipTitle}</RNText>
          <RNText style={{ color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: "600" }}>{tooltipValue}</RNText>
        </View>
      ) : null}
    </View>
  );
}
