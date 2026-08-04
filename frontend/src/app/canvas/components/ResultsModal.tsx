"use client";

import React, { useState, useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight, BarChart3, Database, BrainCircuit, Wrench, Sparkles, Binary } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useAuth } from "@clerk/nextjs"; 

export default function ResultsModal({ isOpen, onClose, pipelineResult }: any) {
  const [chartIndex, setChartIndex] = useState(0);
  const { getToken } = useAuth(); 

  useEffect(() => {
    setChartIndex(0);
  }, [pipelineResult, isOpen]);

  if (!isOpen || !pipelineResult) return null;

  const charts = pipelineResult.charts || [];
  const safeIndex = chartIndex >= charts.length ? 0 : chartIndex;
  const currentChart = charts[safeIndex];

  // Extract the run_id from the backend response!
  const runId = pipelineResult.run_id;

  // ==========================================
  // THE SCORE FIX
  // ==========================================
  const rawModel = pipelineResult.best_model || pipelineResult.metric;
  const displayModel = rawModel ? rawModel.replace("BEST MODEL: ", "") : "Pipeline Executed";

  const metricName = pipelineResult.optimization_metric ? pipelineResult.optimization_metric.toUpperCase() : "SCORE";
  let numericScore = pipelineResult.loss !== undefined ? pipelineResult.loss : (pipelineResult.score !== undefined ? pipelineResult.score : "N/A");

  if (numericScore !== "N/A" && !isNaN(Number(numericScore))) {
    numericScore = Number(numericScore).toFixed(4);
  }

  const displayScore = numericScore !== "N/A" ? `${metricName}: ${numericScore}` : "Check charts for details.";

  const handleDownloadCSV = async (stage: string) => {
    if (!runId) {
      alert("⚠️ Cannot download: Run ID is missing from the results.");
      return;
    }

    try {
      const token = await getToken();
      
      const response = await fetch(`http://localhost:8000/api/download-csv?stage=${stage}&run_id=${runId}&t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errorMessage = errData?.detail || `Download failed for stage: ${stage}`;
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prism_${stage}_data.csv`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      
    } catch (error: any) {
      console.error(`Error downloading ${stage} data:`, error);
      alert(`⚠️ ${error.message}`);
    }
  };
  
  const handleDownloadModel = async () => {
    if (!runId) {
      alert("⚠️ Cannot download: Run ID is missing from the results.");
      return;
    }

    try {
      const token = await getToken();
      
      const response = await fetch(`http://localhost:8000/api/download-model?run_id=${runId}&t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const errorMessage = errData?.detail || "No model found or download failed.";
        throw new Error(errorMessage);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prism_ai_model_${runId}.pkl`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      
    } catch (error: any) {
      console.error("Error downloading model:", error);
      alert(`⚠️ ${error.message}`);
    }
  };
 
  return (
    <div className="fixed inset-0 z-[9999] bg-[#fdfaf5] flex flex-col overflow-hidden">
      
      <div className="h-16 lg:h-20 border-b-4 border-black px-4 lg:px-6 flex items-center justify-between shrink-0 bg-yellow-300">
        <h2 className="text-xl lg:text-3xl font-black uppercase flex items-center gap-3">
          <BarChart3 size={28} /> Pipeline Analysis
        </h2>
        <button 
          onClick={onClose} 
          className="p-1.5 lg:p-2 border-4 border-black bg-white hover:bg-red-300 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-xl"
        >
          <X size={24} strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        
        <div className="w-full lg:w-[350px] border-b-4 lg:border-b-0 lg:border-r-4 border-black p-5 flex flex-col gap-6 bg-white shrink-0 overflow-y-auto">
          <div>
            <h3 className="font-black text-lg text-gray-400 uppercase mb-2">Outcome</h3>
            <div className="p-4 border-4 border-black bg-purple-100 rounded-xl shadow-[4px_4px_0px_#000]">
              <p className="font-black text-xl uppercase">BEST MODEL: {displayModel}</p>
              <p className="font-bold text-gray-600 mt-1 uppercase text-sm">{displayScore}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-auto">
            <h3 className="font-black text-lg text-gray-400 uppercase">Artifacts</h3>
            
            <div className="flex flex-col gap-2 border-4 border-black bg-gray-50 p-3 rounded-xl shadow-[4px_4px_0px_#000]">
              <h4 className="font-bold text-xs text-gray-500 uppercase flex items-center gap-2 mb-1">
                <Database size={14} /> Datasets
              </h4>
              
              <button 
                onClick={() => handleDownloadCSV('fixed')}
                className="w-full py-2 px-3 border-4 border-black bg-blue-200 hover:bg-blue-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase"
              >
                <span className="flex items-center gap-2"><Wrench size={16} /> Get Fixed CSV</span>
                <Download size={16} />
              </button>

              <button 
                onClick={() => handleDownloadCSV('cleaned')}
                className="w-full py-2 px-3 border-4 border-black bg-cyan-200 hover:bg-cyan-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase"
              >
                <span className="flex items-center gap-2"><Sparkles size={16} /> Get Cleaned CSV</span>
                <Download size={16} />
              </button>

              <button 
                onClick={() => handleDownloadCSV('engineered')}
                className="w-full py-2 px-3 border-4 border-black bg-indigo-200 hover:bg-indigo-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase"
              >
                <span className="flex items-center gap-2"><Binary size={16} /> Get ML Matrix</span>
                <Download size={16} />
              </button>
            </div>

            {pipelineResult.hasModel || pipelineResult.best_model ? (
              <button 
                onClick={handleDownloadModel}
                className="w-full py-3 px-4 border-4 border-black bg-green-300 hover:bg-green-400 rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-sm lg:text-md uppercase mt-1"
              >
                <span className="flex items-center gap-3"><BrainCircuit size={20} /> Get AI Model</span>
                <Download size={20} />
              </button>
            ) : (
              <div className="w-full py-3 px-4 border-4 border-gray-300 bg-gray-100 rounded-xl flex items-center gap-3 font-bold text-sm text-gray-400 uppercase mt-1">
                <BrainCircuit size={20} /> No Model Trained
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-6 flex flex-col relative bg-gray-50 h-full overflow-hidden">
          {charts.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4 shrink-0 bg-white border-4 border-black p-2 lg:p-3 rounded-2xl shadow-[4px_4px_0px_#000]">
                <button 
                  onClick={() => setChartIndex(prev => prev - 1)} 
                  disabled={chartIndex === 0}
                  className={`p-1.5 lg:p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === 0 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}
                >
                  <ChevronLeft size={20} strokeWidth={3} />
                </button>
                
                <h3 className="text-lg lg:text-xl font-black uppercase text-center flex-1 mx-2 truncate">
                  {currentChart.title || `Visualization ${safeIndex + 1}`}
                </h3>
                
                <button 
                  onClick={() => setChartIndex(prev => prev + 1)} 
                  disabled={chartIndex === charts.length - 1}
                  className={`p-1.5 lg:p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === charts.length - 1 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}
                >
                  <ChevronRight size={20} strokeWidth={3} />
                </button>
              </div>

              <div className="flex-1 min-h-0 relative border-4 border-black bg-white rounded-2xl lg:rounded-3xl p-2 lg:p-4 shadow-[4px_4px_0px_#000]">
                {/* THE FIX: Added key={safeIndex} to force React to render a fresh canvas every time you click next/prev */}
                <ReactECharts 
                  key={safeIndex}
                  option={currentChart.echarts_payload} 
                  style={{ height: '100%', width: '100%' }} 
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
              
              <p className="text-center font-bold text-xs lg:text-sm text-gray-500 mt-3 uppercase tracking-widest shrink-0">
                Graph {safeIndex + 1} of {charts.length}
              </p>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-4 border-dashed border-gray-300 rounded-3xl">
              <BarChart3 size={64} className="text-gray-300 mb-4" />
              <h3 className="text-xl lg:text-2xl font-black text-gray-400 uppercase">No Visualizations Generated</h3>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}