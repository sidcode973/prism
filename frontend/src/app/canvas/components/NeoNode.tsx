import React from 'react';
import { Handle, Position } from "@xyflow/react";

export default function NeoNode({ data }: { data: any }) {
  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[220px] bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000] relative">
      <Handle type="target" position={Position.Left} className="!w-6 !h-6 !bg-blue-200 border-4 border-black rounded-full -ml-3 z-10 cursor-crosshair shadow-[2px_2px_0px_#000]" />
      <div className="flex items-center gap-3 mb-2 border-b-2 border-gray-200 pb-2">
        <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>{data.icon}</div>
        <h3 className="font-black text-lg uppercase tracking-tight">{data.label}</h3>
      </div>
      <p className="text-xs font-bold text-gray-500 uppercase truncate">{data.description}</p>
      <Handle type="source" position={Position.Right} className="!w-6 !h-6 !bg-yellow-300 border-4 border-black rounded-full -mr-3 z-10 cursor-crosshair shadow-[2px_2px_0px_#000]" />
    </div>
  );
}