"use client";

import React, { useState, useEffect } from "react";
import ReactECharts from 'echarts-for-react';
import { X, Trophy, FileText, BrainCircuit, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

interface ResultsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineResult: any;
}

export default function ResultsSidebar({ isOpen, onClose, pipelineResult }: ResultsSidebarProps) {
  const { getToken } = useAuth();
  const [currentChartIndex, setCurrentChartIndex] = useState<number>(0);
  
  // ---> NEW STATE FOR THE DELAY PATCH <---
  const [renderChart, setRenderChart] = useState<boolean>(false);

  // ---> NEW TIMER LOGIC <---
  useEffect(() => {
    if (isOpen) {
      setRenderChart(false);
      const timer = setTimeout(() => setRenderChart(true), 350); // Wait for the drawer animation
      return () => clearTimeout(timer);
    } else {
      setRenderChart(false);
    }
  }, [isOpen]);

  if (!pipelineResult) return null;

  const handleDownloadModel = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("http://localhost:8000/api/download-model", { method: "GET", headers: { "Authorization": `Bearer ${token}` } });
      if (!response.ok) { alert("❌ Model file not found."); return; }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = "ai_pipeline_model.pkl"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (error) { alert("❌ Critical error while downloading the model."); }
  };

  const handleDownloadCleanData = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch("http://localhost:8000/api/download-clean-data", { method: "GET", headers: { "Authorization": `Bearer ${token}` } });
      if (!response.ok) { alert("❌ Cleaned dataset not found."); return; }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = "prism_cleaned_data.csv"; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (error) { alert("❌ Critical error while downloading the dataset."); }
  };

  const getEChartsOption = () => {
    if (!pipelineResult?.charts || pipelineResult.charts.length === 0) return {};
    const activeChart = pipelineResult.charts[currentChartIndex];
    if (!activeChart || !activeChart.echarts_payload) return {};

    let option: any = {};
    try {
      let payload = activeChart.echarts_payload;
      if (typeof payload === 'string') payload = JSON.parse(payload);
      option = JSON.parse(JSON.stringify(payload));
    } catch(e) {
      option = { ...activeChart.echarts_payload };
    }

    option.toolbox = { show: true, feature: { saveAsImage: { show: true, title: 'Download Chart', pixelRatio: 2 } }, right: '5%', top: '2%' };
    option.grid = { left: '12%', right: '12%', bottom: '15%', top: '15%' };
    
    if (Array.isArray(option.series) && option.series.length > 0) {
        if (!option.series[0].itemStyle) option.series[0].itemStyle = {};
        option.series[0].itemStyle.color = '#a855f7'; 
        option.series[0].itemStyle.borderColor = '#000'; 
        option.series[0].itemStyle.borderWidth = 2;
        if (option.series[0].type === 'scatter') {
             option.series[0].itemStyle.color = '#facc15'; 
             option.series[0].symbolSize = 12;
        }
    }
    return option;
  };

  return (
    <div className={`absolute top-0 right-0 z-40 h-full w-full max-w-[550px] bg-white border-l-8 border-black shadow-[-16px_0px_0px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      
      <div className="w-full pt-6 pl-6 pb-2 shrink-0 relative z-10">
        <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-red-200 border-4 border-black rounded-xl transition-all shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none">
          <X size={24} strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 relative min-h-0 w-full">
        <div className="absolute inset-0 overflow-y-auto px-8 pb-24 pt-4 custom-scrollbar flex flex-col">
          
          <div className="mx-auto w-16 h-16 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mb-4 shadow-[4px_4px_0px_#000] shrink-0">
            <Trophy size={32} className="text-black" />
          </div>
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter text-center shrink-0">Pipeline Performance</h2>
          
          {pipelineResult?.score && pipelineResult?.metric && (
            <div className="bg-green-100 border-4 border-black rounded-2xl p-6 mb-6 transform -rotate-1 shadow-[8px_8px_0px_#000] mt-4 shrink-0">
              <p className="font-black text-gray-500 uppercase tracking-widest text-xs mb-1">{pipelineResult.metric}</p>
              <p className="text-5xl font-black text-green-600">{pipelineResult.score}</p>
            </div>
          )}

          <div className="flex flex-col gap-3 mb-8 shrink-0">
            {pipelineResult?.hasCleanData && (
              <button onClick={handleDownloadCleanData} className="w-full bg-green-400 hover:bg-green-500 text-black font-black text-lg py-3 rounded-xl border-4 border-black shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all flex items-center justify-center gap-3">
                <FileText size={22} /> DOWNLOAD CLEAN CSV
              </button>
            )}
            {pipelineResult?.hasModel && (
              <button onClick={handleDownloadModel} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black text-lg py-3 rounded-xl border-4 border-black shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all flex items-center justify-center gap-3">
                <BrainCircuit size={22} /> DOWNLOAD .PKL MODEL
              </button>
            )}
          </div>

          {pipelineResult?.charts && pipelineResult.charts.length > 0 && (
            <div className="w-full bg-[#fdfaf5] border-4 border-black rounded-2xl p-4 shadow-[8px_8px_0px_#000] flex flex-col relative mb-8 shrink-0">
              <div className="w-full flex items-center justify-between border-b-4 border-black pb-3 mb-4 shrink-0">
                <h3 className="font-black uppercase text-sm text-left truncate max-w-[55%]">{pipelineResult.charts[currentChartIndex]?.title || "AI Target Chart"}</h3>
                {pipelineResult.charts.length > 1 && (
                  <div className="flex items-center gap-2 font-black text-xs select-none">
                    <button onClick={() => setCurrentChartIndex(p => Math.max(0, p - 1))} disabled={currentChartIndex === 0} className="px-2 py-1 bg-white hover:bg-gray-100 disabled:opacity-30 border-2 border-black rounded shadow-[2px_2px_0px_#000] disabled:shadow-none transition-all cursor-pointer">PREV</button>
                    <span className="bg-gray-100 border-2 border-black px-2 py-1 rounded text-[10px] min-w-[45px] text-center">{currentChartIndex + 1} / {pipelineResult.charts.length}</span>
                    <button onClick={() => setCurrentChartIndex(p => Math.min(pipelineResult.charts.length - 1, p + 1))} disabled={currentChartIndex === pipelineResult.charts.length - 1} className="px-2 py-1 bg-white hover:bg-gray-100 disabled:opacity-30 border-2 border-black rounded shadow-[2px_2px_0px_#000] disabled:shadow-none transition-all cursor-pointer">NEXT</button>
                  </div>
                )}
              </div>
              
              {/* ---> THE CHART RENDER FIX <--- */}
              <div style={{ height: '400px', width: '100%' }}>
                {renderChart ? (
                   <ReactECharts option={getEChartsOption()} style={{ height: '100%', width: '100%' }} notMerge={true} />
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 font-bold animate-pulse border-2 border-dashed border-gray-300 rounded-xl">
                     <Loader2 size={32} className="animate-spin mb-2" />
                     Painting Chart...
                   </div>
                )}
              </div>

            </div>
          )}

          <button 
            onClick={onClose} 
            className="w-full bg-black text-white font-black text-lg py-4 rounded-xl border-4 border-transparent hover:bg-gray-800 transition-colors shadow-[6px_6px_0px_#ccc] active:translate-y-1 active:shadow-none shrink-0 mt-auto"
          >
            CLOSE SIDEBAR
          </button>
        </div>
      </div>
    </div>
  );
}