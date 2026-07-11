import React, { useState } from 'react';
import { X, Download, ChevronLeft, ChevronRight, BarChart3, Database, BrainCircuit } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useAuth } from "@clerk/nextjs"; 

export default function ResultsModal({ isOpen, onClose, pipelineResult }: any) {
  const [chartIndex, setChartIndex] = useState(0);
  const { getToken } = useAuth(); 

  if (!isOpen || !pipelineResult) return null;

  const charts = pipelineResult.charts || [];
  const currentChart = charts[chartIndex];

  const handleDownloadData = async () => {
    try {
      const token = await getToken();
      
      const response = await fetch(`http://localhost:8000/api/download-clean-data?t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "prism_processed_data.csv";
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      
    } catch (error) {
      console.error("Error downloading data:", error);
      alert("⚠️ Failed to download data. Please check your connection.");
    }
  };
  
  const handleDownloadModel = async () => {
    try {
      const token = await getToken();
      
      const response = await fetch(`http://localhost:8000/api/download-model?t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "prism_ai_model.pkl";
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
      
    } catch (error) {
      console.error("Error downloading model:", error);
      alert("⚠️ Failed to download model. Please check your connection.");
    }
  };
 
  return (
    <div className="fixed inset-0 z-[9999] bg-[#fdfaf5] flex flex-col overflow-hidden">
      
      {/* HEADER */}
      <div className="h-20 border-b-4 border-black px-6 flex items-center justify-between shrink-0 bg-yellow-300">
        <h2 className="text-3xl font-black uppercase flex items-center gap-3">
          <BarChart3 size={32} /> Pipeline Analysis
        </h2>
        <button 
          onClick={onClose} 
          className="p-2 border-4 border-black bg-white hover:bg-red-300 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-xl"
        >
          <X size={24} strokeWidth={3} />
        </button>
      </div>

      {/* BODY */}
      <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        
        {/* LEFT PANEL: Metrics & Downloads */}
        <div className="w-full lg:w-[400px] border-b-4 lg:border-b-0 lg:border-r-4 border-black p-8 flex flex-col gap-8 bg-white shrink-0 overflow-y-auto">
          <div>
            <h3 className="font-black text-xl text-gray-400 uppercase mb-2">Outcome</h3>
            <div className="p-4 border-4 border-black bg-purple-100 rounded-xl shadow-[4px_4px_0px_#000]">
              <p className="font-black text-2xl uppercase">{pipelineResult.metric || "Pipeline Executed"}</p>
              <p className="font-bold text-gray-600 mt-1">{pipelineResult.score || "Check charts for details."}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-auto">
            <h3 className="font-black text-xl text-gray-400 uppercase">Artifacts</h3>
            
            {pipelineResult.hasCleanData ? (
              <button 
                onClick={handleDownloadData}
                className="w-full py-4 px-6 border-4 border-black bg-blue-300 hover:bg-blue-400 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-lg uppercase"
              >
                <span className="flex items-center gap-3"><Database size={24} /> Get CSV Data</span>
                <Download size={24} />
              </button>
            ) : (
              <div className="w-full py-4 px-6 border-4 border-gray-300 bg-gray-100 rounded-xl flex items-center gap-3 font-bold text-gray-400 uppercase">
                <Database size={24} /> No Data Generated
              </div>
            )}

            {pipelineResult.hasModel ? (
              <button 
                onClick={handleDownloadModel}
                className="w-full py-4 px-6 border-4 border-black bg-green-300 hover:bg-green-400 rounded-xl shadow-[6px_6px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-lg uppercase"
              >
                <span className="flex items-center gap-3"><BrainCircuit size={24} /> Get AI Model</span>
                <Download size={24} />
              </button>
            ) : (
              <div className="w-full py-4 px-6 border-4 border-gray-300 bg-gray-100 rounded-xl flex items-center gap-3 font-bold text-gray-400 uppercase">
                <BrainCircuit size={24} /> No Model Trained
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Large Chart Area */}
        <div className="flex-1 p-8 flex flex-col relative bg-gray-50 h-full overflow-hidden">
          {charts.length > 0 ? (
            <>
              {/* Carousel Controls */}
              <div className="flex items-center justify-between mb-6 shrink-0 bg-white border-4 border-black p-4 rounded-2xl shadow-[4px_4px_0px_#000]">
                <button 
                  onClick={() => setChartIndex(prev => prev - 1)} 
                  disabled={chartIndex === 0}
                  className={`p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === 0 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}
                >
                  <ChevronLeft size={24} strokeWidth={3} />
                </button>
                
                <h3 className="text-2xl font-black uppercase text-center flex-1 mx-4 truncate">
                  {currentChart.title || `Visualization ${chartIndex + 1}`}
                </h3>
                
                <button 
                  onClick={() => setChartIndex(prev => prev + 1)} 
                  disabled={chartIndex === charts.length - 1}
                  className={`p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === charts.length - 1 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}
                >
                  <ChevronRight size={24} strokeWidth={3} />
                </button>
              </div>

              {/* Massive Graph Container */}
              <div className="flex-1 min-h-0 relative border-4 border-black bg-white rounded-3xl p-6 shadow-[8px_8px_0px_#000]">
                <ReactECharts 
                  option={currentChart.echarts_payload} 
                  style={{ height: '100%', width: '100%' }} 
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
              
              <p className="text-center font-bold text-gray-500 mt-4 uppercase tracking-widest shrink-0">
                Graph {chartIndex + 1} of {charts.length}
              </p>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-4 border-dashed border-gray-300 rounded-3xl">
              <BarChart3 size={64} className="text-gray-300 mb-4" />
              <h3 className="text-2xl font-black text-gray-400 uppercase">No Visualizations Generated</h3>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}