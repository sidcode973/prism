import React from 'react';
import { UploadCloud, Eraser, Sparkles } from "lucide-react";

export default function BottomBar({ 
  selectedDatasetId, setSelectedDatasetId, availableDatasets, 
  setIsUploadModalOpen, handleClearCanvas, nodesLength, 
  aiPrompt, setAiPrompt, handleAIGenerate 
}: any) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex flex-col md:flex-row gap-3 items-center">
        <div className="w-full md:w-[340px] shrink-0 flex gap-2 items-center">
          <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)} className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold bg-gray-100 focus:ring-4 focus:ring-purple-300 outline-none cursor-pointer text-sm truncate">
            <option value="" disabled>{availableDatasets.length === 0 ? "⚠️ No Hosted Files" : "1. Choose Target Dataset"}</option>
            {availableDatasets.map((ds: any) => (<option key={ds.id} value={ds.id}>📄 {ds.file_name}</option>))}
          </select>
          <button onClick={() => setIsUploadModalOpen(true)} className="w-[52px] h-[52px] shrink-0 flex items-center justify-center bg-purple-400 hover:bg-purple-500 border-4 border-black rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all text-white"><UploadCloud size={24} strokeWidth={3} /></button>
          <button onClick={handleClearCanvas} disabled={nodesLength === 0} className={`w-[52px] h-[52px] shrink-0 flex items-center justify-center border-4 border-black rounded-xl transition-all ${nodesLength === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-400' : 'bg-red-400 hover:bg-red-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none text-white'}`}><Eraser size={24} strokeWidth={3} /></button>
        </div>
        <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="2. Auto-build with AI, or click Run if manually connected..." className="flex-1 min-w-0 w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none text-sm" onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()} />
        <button onClick={handleAIGenerate} className="shrink-0 w-full md:w-auto flex items-center justify-center gap-2 border-4 border-black bg-purple-400 hover:bg-purple-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all px-8 py-3 rounded-xl font-black text-white">
          <Sparkles fill="white" size={20} /> RUN / GEN
        </button>
      </div>
    </div>
  );
}