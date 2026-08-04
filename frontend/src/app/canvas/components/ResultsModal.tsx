"use client";

import React, { useState, useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight, BarChart3, Database, BrainCircuit, Wrench, Sparkles, Binary, Rocket, Zap, Play, CheckCircle2, Plus } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { useAuth } from "@clerk/nextjs"; 

export default function ResultsModal({ isOpen, onClose, pipelineResult }: any) {
  const [chartIndex, setChartIndex] = useState(0);
  
  const [isDeployed, setIsDeployed] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [showPlayground, setShowPlayground] = useState(false);
  
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');
  const [testPayload, setTestPayload] = useState('{}');
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  const [testResult, setTestResult] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const { getToken } = useAuth(); 

  useEffect(() => {
    setChartIndex(0);
    setIsDeployed(pipelineResult?.is_deployed || false);
    setApiEndpoint(pipelineResult?.api_endpoint || "");
    setShowPlayground(false);
    setTestResult("");

    // ==========================================
    // 🧠 CLOUD HYDRATION FIX 🧠
    // ==========================================
    if (pipelineResult && pipelineResult.feature_names) {
      // Inline Execution: We have features instantly
      const dynamicForm: Record<string, any> = {};
      pipelineResult.feature_names.forEach((feat: string) => { dynamicForm[feat] = ""; });
      setFormData(dynamicForm);
      setTestPayload(JSON.stringify(dynamicForm, null, 2));
    } 
    else if (pipelineResult && pipelineResult.run_id) {
      // History Execution: Fetch permanent features from MinIO cloud blueprint
      getToken().then(token => {
        fetch(`http://localhost:8000/api/predict/${pipelineResult.run_id}/features`, {
          headers: { "Authorization": `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data.features && data.features.length > 0) {
            const dynamicForm: Record<string, any> = {};
            data.features.forEach((feat: string) => { dynamicForm[feat] = ""; });
            setFormData(dynamicForm);
            setTestPayload(JSON.stringify(dynamicForm, null, 2));
          }
        }).catch(err => console.error("Could not fetch cloud features.", err));
      });
    } else {
      setFormData({});
      setTestPayload("{}");
    }
  }, [pipelineResult, isOpen]);

  if (!isOpen || !pipelineResult) return null;

  const charts = pipelineResult.charts || [];
  const safeIndex = chartIndex >= charts.length ? 0 : chartIndex;
  const currentChart = charts[safeIndex];
  const runId = pipelineResult.run_id;

  const rawModel = pipelineResult.best_model || pipelineResult.metric;
  const displayModel = rawModel ? rawModel.replace("BEST MODEL: ", "") : "Pipeline Executed";
  const metricName = pipelineResult.optimization_metric ? pipelineResult.optimization_metric.toUpperCase() : "SCORE";
  
  let numericScore = pipelineResult.loss !== undefined ? pipelineResult.loss : (pipelineResult.score !== undefined ? pipelineResult.score : "N/A");
  if (numericScore !== "N/A" && !isNaN(Number(numericScore))) numericScore = Number(numericScore).toFixed(4);
  const displayScore = numericScore !== "N/A" ? `${metricName}: ${numericScore}` : "Check charts for details.";

  const handleSwitchToForm = () => {
    try {
      const parsed = JSON.parse(testPayload);
      setFormData(parsed);
      setViewMode('form');
    } catch (e) {
      alert("⚠️ Syntax Error: Please fix your JSON before switching to Form View.");
    }
  };

  const handleSwitchToJson = () => {
    setTestPayload(JSON.stringify(formData, null, 2));
    setViewMode('json');
  };

  const updateFormField = (key: string, value: string) => {
    let parsedValue: any = value;
    if (value !== "" && !isNaN(Number(value))) {
      parsedValue = Number(value);
    }
    
    const newData = { ...formData, [key]: parsedValue };
    setFormData(newData);
    setTestPayload(JSON.stringify(newData, null, 2));
  };

  const addFormField = () => {
    const newData = { ...formData, [`new_feature_${Object.keys(formData).length}`]: "" };
    setFormData(newData);
    setTestPayload(JSON.stringify(newData, null, 2));
  };

  const removeFormField = (keyToRemove: string) => {
    const newData = { ...formData };
    delete newData[keyToRemove];
    setFormData(newData);
    setTestPayload(JSON.stringify(newData, null, 2));
  };

  const handleDownloadCSV = async (stage: string) => {
    if (!runId) return alert("⚠️ Cannot download: Run ID is missing from the results.");
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/api/download-csv?stage=${stage}&run_id=${runId}&t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await response.json().then((d: any) => d?.detail).catch(() => "Download failed"));
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prism_${stage}_data.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (error: any) {
      console.error(`Error downloading ${stage} data:`, error);
      alert(`⚠️ ${error.message}`);
    }
  };
  
  const handleDownloadModel = async () => {
    if (!runId) return alert("⚠️ Cannot download: Run ID is missing from the results.");
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/api/download-model?run_id=${runId}&t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(await response.json().then((d: any) => d?.detail).catch(() => "Download failed"));
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prism_ai_model_${runId}.pkl`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (error: any) {
      console.error("Error downloading model:", error);
      alert(`⚠️ ${error.message}`);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/api/models/deploy/${runId}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Deployment failed");
      
      setIsDeployed(true);
      setApiEndpoint(data.api_endpoint);
    } catch (error: any) {
      alert(`⚠️ Deployment Error: ${error.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleTestLiveApi = async () => {
    let parsedPayload;
    try {
      parsedPayload = JSON.parse(testPayload);
    } catch (e) {
      setTestResult('⚠️ Invalid JSON format in payload.');
      return;
    }

    setIsTesting(true);
    setTestResult("Connecting to inference engine...");
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/api/predict/${runId}`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsedPayload)
      });
      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (error: any) {
      setTestResult(`⚠️ Request Failed: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#fdfaf5] flex flex-col overflow-hidden">
      
      <div className="h-16 lg:h-20 border-b-4 border-black px-4 lg:px-6 flex items-center justify-between shrink-0 bg-yellow-300">
        <h2 className="text-xl lg:text-3xl font-black uppercase flex items-center gap-3">
          <BarChart3 size={28} /> Pipeline Analysis
        </h2>
        <button onClick={onClose} className="p-1.5 lg:p-2 border-4 border-black bg-white hover:bg-red-300 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-xl">
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
              <button onClick={() => handleDownloadCSV('fixed')} className="w-full py-2 px-3 border-4 border-black bg-blue-200 hover:bg-blue-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase">
                <span className="flex items-center gap-2"><Wrench size={16} /> Get Fixed CSV</span><Download size={16} />
              </button>
              <button onClick={() => handleDownloadCSV('cleaned')} className="w-full py-2 px-3 border-4 border-black bg-cyan-200 hover:bg-cyan-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase">
                <span className="flex items-center gap-2"><Sparkles size={16} /> Get Cleaned CSV</span><Download size={16} />
              </button>
              <button onClick={() => handleDownloadCSV('engineered')} className="w-full py-2 px-3 border-4 border-black bg-indigo-200 hover:bg-indigo-300 rounded-lg active:translate-x-1 active:translate-y-1 transition-transform flex items-center justify-between font-black text-xs lg:text-sm uppercase">
                <span className="flex items-center gap-2"><Binary size={16} /> Get ML Matrix</span><Download size={16} />
              </button>
            </div>

            {pipelineResult.hasModel || pipelineResult.best_model ? (
              <div className="flex flex-col gap-2 mt-1">
                <button onClick={handleDownloadModel} className="w-full py-3 px-4 border-4 border-black bg-green-300 hover:bg-green-400 rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-sm lg:text-md uppercase">
                  <span className="flex items-center gap-3"><BrainCircuit size={20} /> Get AI Model</span><Download size={20} />
                </button>

                {!isDeployed ? (
                  <button onClick={handleDeploy} disabled={isDeploying} className="w-full py-3 px-4 border-4 border-black bg-black text-white hover:bg-gray-800 rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-sm lg:text-md uppercase disabled:opacity-50">
                    <span className="flex items-center gap-3"><Rocket size={20} /> {isDeploying ? "Deploying..." : "One-Click Deploy"}</span>
                  </button>
                ) : (
                  <button onClick={() => setShowPlayground(!showPlayground)} className="w-full py-3 px-4 border-4 border-black bg-orange-300 hover:bg-orange-400 rounded-xl shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-between font-black text-sm lg:text-md uppercase">
                    <span className="flex items-center gap-3"><Zap size={20} /> {showPlayground ? "Close Playground" : "Test Live API"}</span><CheckCircle2 size={20} />
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full py-3 px-4 border-4 border-gray-300 bg-gray-100 rounded-xl flex items-center gap-3 font-bold text-sm text-gray-400 uppercase mt-1">
                <BrainCircuit size={20} /> No Model Trained
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 lg:p-6 flex flex-col relative bg-gray-50 h-full overflow-hidden">
          
          {showPlayground && isDeployed && (
            <div className="absolute inset-4 lg:inset-6 z-50 bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_#000] p-6 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-4 border-b-4 border-black pb-4 shrink-0">
                <h3 className="font-black text-2xl uppercase flex items-center gap-2"><Zap size={28} className="text-orange-500"/> API Playground</h3>
                <button onClick={() => setShowPlayground(false)} className="p-1 hover:bg-red-200 border-2 border-transparent hover:border-black rounded-lg transition-all"><X size={24} strokeWidth={3} /></button>
              </div>
              
              <div className="bg-gray-100 border-2 border-black p-2 rounded-lg font-mono text-xs mb-4 flex items-center justify-between shrink-0">
                <span className="truncate flex-1"><strong>POST</strong> {apiEndpoint}</span>
                <span className="bg-green-300 border-2 border-black px-2 py-0.5 rounded text-[10px] font-black uppercase">Active</span>
              </div>

              <div className="flex-1 flex gap-4 min-h-0">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-sm uppercase text-gray-500">Payload</label>
                    <div className="flex bg-gray-200 p-1 rounded-lg border-2 border-black shadow-[2px_2px_0px_#000]">
                      <button onClick={handleSwitchToForm} className={`px-3 py-1 font-black text-[10px] uppercase rounded transition-all ${viewMode === 'form' ? 'bg-white border-2 border-black shadow-[2px_2px_0px_#000]' : 'text-gray-500 hover:text-black'}`}>Form</button>
                      <button onClick={handleSwitchToJson} className={`px-3 py-1 font-black text-[10px] uppercase rounded transition-all ${viewMode === 'json' ? 'bg-white border-2 border-black shadow-[2px_2px_0px_#000]' : 'text-gray-500 hover:text-black'}`}>JSON</button>
                    </div>
                  </div>

                  {viewMode === 'json' ? (
                    <textarea 
                      value={testPayload}
                      onChange={(e) => setTestPayload(e.target.value)}
                      className="flex-1 w-full border-4 border-black rounded-xl p-4 font-mono text-sm resize-none focus:outline-none focus:bg-yellow-50"
                    />
                  ) : (
                    <div className="flex-1 w-full border-4 border-black rounded-xl p-4 bg-gray-50 overflow-y-auto flex flex-col gap-3">
                      {Object.keys(formData).map(key => (
                        <div key={key} className="flex flex-col relative group">
                          <label className="font-black text-[10px] uppercase text-gray-500 tracking-wider mb-1">{key}</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              value={formData[key]} 
                              onChange={(e) => updateFormField(key, e.target.value)}
                              className="flex-1 border-2 border-black rounded-lg p-2 text-sm font-bold focus:bg-yellow-100 outline-none shadow-[2px_2px_0px_#000]"
                            />
                            <button onClick={() => removeFormField(key)} title="Remove Field" className="p-2 border-2 border-transparent text-gray-400 hover:border-red-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"><X size={16} strokeWidth={3}/></button>
                          </div>
                        </div>
                      ))}
                      <button onClick={addFormField} className="w-full py-2 border-2 border-dashed border-gray-400 text-gray-500 font-black text-xs uppercase rounded-lg hover:border-black hover:text-black hover:bg-gray-100 flex items-center justify-center gap-2 transition-all mt-2">
                        <Plus size={16} /> Add Field
                      </button>
                    </div>
                  )}

                  <button onClick={handleTestLiveApi} disabled={isTesting} className="w-full py-3 mt-2 bg-black text-white font-black uppercase border-4 border-black hover:bg-gray-800 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                    {isTesting ? "Executing..." : <><Play size={18} fill="currentColor"/> Send Request</>}
                  </button>
                </div>
                
                <div className="flex-1 flex flex-col gap-2">
                  <label className="font-black text-sm uppercase text-gray-500">Inference Response</label>
                  <pre className="flex-1 w-full border-4 border-black rounded-xl p-4 font-mono text-sm bg-gray-900 text-green-400 overflow-auto">
                    {testResult || "// Engine ready. Awaiting request..."}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {charts.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-4 shrink-0 bg-white border-4 border-black p-2 lg:p-3 rounded-2xl shadow-[4px_4px_0px_#000]">
                <button onClick={() => setChartIndex(prev => prev - 1)} disabled={chartIndex === 0} className={`p-1.5 lg:p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === 0 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}><ChevronLeft size={20} strokeWidth={3} /></button>
                <h3 className="text-lg lg:text-xl font-black uppercase text-center flex-1 mx-2 truncate">{currentChart.title || `Visualization ${safeIndex + 1}`}</h3>
                <button onClick={() => setChartIndex(prev => prev + 1)} disabled={chartIndex === charts.length - 1} className={`p-1.5 lg:p-2 border-4 border-black rounded-xl shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all ${chartIndex === charts.length - 1 ? 'bg-gray-200 opacity-50 cursor-not-allowed' : 'bg-yellow-300 hover:bg-yellow-400'}`}><ChevronRight size={20} strokeWidth={3} /></button>
              </div>
              <div className="flex-1 min-h-0 relative border-4 border-black bg-white rounded-2xl lg:rounded-3xl p-2 lg:p-4 shadow-[4px_4px_0px_#000]">
                <ReactECharts key={safeIndex} option={currentChart.echarts_payload} style={{ height: '100%', width: '100%' }} notMerge={true} lazyUpdate={true} />
              </div>
              <p className="text-center font-bold text-xs lg:text-sm text-gray-500 mt-3 uppercase tracking-widest shrink-0">Graph {safeIndex + 1} of {charts.length}</p>
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