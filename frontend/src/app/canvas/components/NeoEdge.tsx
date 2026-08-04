import React from 'react';
import { BaseEdge, getBezierPath } from "@xyflow/react";

export default function NeoEdge({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
}