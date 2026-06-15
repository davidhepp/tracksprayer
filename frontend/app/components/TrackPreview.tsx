import { useMemo } from "react";

import type { TrackGeometry } from "../lib/tracksApi";

type ConeType = "blue" | "yellow" | "orange" | "orange_big";

type PreviewCone = {
  id: string;
  x: number;
  y: number;
  type: ConeType;
};

function collectCones(track: TrackGeometry): PreviewCone[] {
  const cones: PreviewCone[] = [];
  const push = (points: number[][], type: ConeType) => {
    points.forEach(([x, y], index) => {
      cones.push({ id: `${type}-${index}`, x, y, type });
    });
  };
  push(track.cones_left, "blue");
  push(track.cones_right, "yellow");
  push(track.cones_orange, "orange");
  push(track.cones_orange_big, "orange_big");
  return cones;
}

export function TrackPreview({ track }: { track: TrackGeometry | null }) {
  const cones = useMemo(() => (track ? collectCones(track) : []), [track]);

  const viewBox = useMemo(() => {
    if (!track || cones.length === 0) {
      return null;
    }

    const xs = cones.map((cone) => cone.x);
    const ys = cones.map((cone) => cone.y);
    if (track.starting_pose.length >= 2) {
      xs.push(track.starting_pose[0]);
      ys.push(track.starting_pose[1]);
    }

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 3;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    // Screen y is negated so positive y points up.
    return {
      value: `${minX - padding} ${-(maxY + padding)} ${width} ${height}`,
      span: Math.max(width, height),
    };
  }, [cones, track]);

  if (!track || !viewBox) {
    return (
      <div className="track-preview is-empty">
        <p>No track selected. Generate or pick a track to preview it.</p>
      </div>
    );
  }

  const startPose = track.starting_pose;
  const hasStart = startPose.length >= 2;
  const yaw = startPose.length >= 3 ? startPose[2] : 0;
  const arrowLength = Math.max(viewBox.span * 0.04, 1.5);

  return (
    <div className="track-preview">
      <svg viewBox={viewBox.value} preserveAspectRatio="xMidYMid meet">
        {hasStart && (
          <g className="start-pose" transform={`translate(${startPose[0]} ${-startPose[1]})`}>
            <line
              x1={0}
              y1={0}
              x2={Math.cos(yaw) * arrowLength}
              y2={-Math.sin(yaw) * arrowLength}
            />
            <circle r={Math.max(viewBox.span * 0.012, 0.45)} />
          </g>
        )}
        {track.tk_device.map(([x, y], index) => (
          <g
            key={`tk-${index}`}
            className="tk-device"
            transform={`translate(${x} ${-y})`}
          >
            <path d={`M-0.6 -0.6 L0.6 0.6 M-0.6 0.6 L0.6 -0.6`} />
          </g>
        ))}
        {cones.map((cone) => (
          <PreviewConeMark key={cone.id} cone={cone} />
        ))}
      </svg>
    </div>
  );
}

function PreviewConeMark({ cone }: { cone: PreviewCone }) {
  const size = cone.type === "orange_big" ? 0.95 : 0.62;
  const base = size * 0.72;

  return (
    <g className={`cone ${cone.type}`} transform={`translate(${cone.x} ${-cone.y})`}>
      <circle r={size * 0.52} />
      <path d={`M${-base} ${base} L0 ${-size} L${base} ${base} Z`} />
    </g>
  );
}
