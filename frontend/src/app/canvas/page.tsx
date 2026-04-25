"use client";

import React, { useCallback, useState, useEffect } from "react";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import ReactECharts from 'echarts-for-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Sparkles, BrainCircuit, Database, BarChart3, Settings, FileText, Bot, Loader2, X, Trophy } from "lucide-react";

// ==========================================
// 1. CUSTOM WIRE (EDGE)
// ==========================================
const NeoEdge = ({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
};

// ==========================================
// 2. CUSTOM BLOCK (NODE) - Now Read-Only
// ==========================================
const NeoNode = ({ data }: { data: any }) => {
  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[240px] bg-white transition-all duration-200">
      <Handle type="target" position={Position.Left} className="w-4 h-4 border-4 border-black bg-white -ml-2" />
      <div className="flex items-center gap-3 mb-3 border-b-2 border-gray-200 pb-2">
        <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>
           {data.icon}
        </div>
        <h3 className="font-black text-lg">{data.label}</h3>
      </div>
      <p className="text-sm font-bold text-gray-600 bg-gray-100 p-2 border-2 border-gray-300 rounded-md truncate">
        {data.description}
      </p>
      <Handle type="source" position={Position.Right} className="w-4 h-4 border-4 border-black bg-white -mr-2" />
    </div>
  );
};

const nodeTypes: any = { neoNode: NeoNode };
const edgeTypes: any = { neoEdge: NeoEdge };

// ==========================================
// 3. THE AI CANVAS LOGIC
// ==========================================
function CanvasBoard() {
  const { fitView } = useReactFlow();
  const { getToken } = useAuth();
  
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);
  
  // ---> NEW AI STATES <---
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);

  // Fetch datasets on load
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const response = await fetch("http://localhost:8000/api/datasets", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableDatasets(data.datasets);
        }
      } catch (error) {
        console.error("Failed to fetch datasets");
      }
    };
    fetchDatasets();
  }, [getToken]);

  // ---> NEW: Auto-Draw the Graph from the AI's JSON Contract <---
  const autoDrawGraph = (dagStructure: any) => {
    const newNodes: any[] = [];
    const newEdges: any[] = [];

    // 1. Generate Nodes
    dagStructure.nodes.forEach((n: any, index: number) => {
      let color = 'bg-gray-300';
      let icon = <Settings size={20} />;
      let uiLabel = n.action_type;

      if (n.action_type === 'load_dataset') { color = 'bg-green-300'; icon = <Database size={20} />; uiLabel = "Raw Data"; }
      if (n.action_type === 'clean_data') { color = 'bg-blue-300'; icon = <Sparkles size={20} />; uiLabel = "Clean Data"; }
      if (n.action_type === 'train_model') { color = 'bg-purple-300'; icon = <BrainCircuit size={20} />; uiLabel = "Train Model"; }
      if (n.action_type === 'generate_plot') { color = 'bg-pink-300'; icon = <BarChart3 size={20} />; uiLabel = "Plot Graph"; } // <-- FIXED ICON KEY

      newNodes.push({
        id: n.node_id,
        type: 'neoNode',
        position: { x: 100 + (index * 320), y: 250 }, // Auto-spacing horizontally!
        data: {
          label: n.parameters.ui_label || uiLabel,
          description: n.parameters.description || 'AI Configured',
          colorClass: color,
          icon: icon,
          config: n.parameters
        }
      });
    });

    // 2. Generate Edges based on execution_order
    const executionOrder = dagStructure.execution_order;
    for (let i = 0; i < executionOrder.length - 1; i++) {
      newEdges.push({
        id: `edge_${executionOrder[i]}_${executionOrder[i+1]}`,
        source: executionOrder[i],
        target: executionOrder[i+1],
        type: 'neoEdge',
        animated: true,
        style: { stroke: 'black', strokeWidth: 4 }
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
    
    // Zoom out to fit the new graph beautifully
    setTimeout(() => fitView({ padding: 0.3, duration: 800 }), 100);
  };

  // ---> NEW: Talk to Bhavya's Llama 3 Agent <---
  const handleAIGenerate = async () => {
    if (!selectedDataset) {
      alert("⚠️ Please select a dataset first!");
      return;
    }
    if (!aiPrompt) {
      alert("⚠️ Please tell the AI what you want to do!");
      return;
    }

    setIsThinking(true);
    setNodes([]); // Clear board
    setEdges([]);
    setSelectedNode(null);

    try {
      const token = await getToken();
      
      // We use FormData because the FastAPI endpoint expects Form(...)
      const formData = new FormData();
      formData.append("file_name", selectedDataset);
      formData.append("prompt", aiPrompt);

      const response = await fetch("http://localhost:8000/api/run-pipeline", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("🧠 ML ENGINE RAW RESPONSE:", data)
        
        // 1. Draw the graph the AI designed
        autoDrawGraph(data.dag_structure);
        
        // 2. Map Bhavya's Backend Results to our Frontend UI State <-- THIS IS THE FIX
        if (data.execution_results && data.execution_results.results) {
            const rawResults = data.execution_results.results;
            
            const mappedResults = {
                // Map Bhavya's model output to Next.js 'score' and 'metric' variables
                metric: rawResults.best_model ? `Best Model: ${rawResults.best_model}` : null,
                score: rawResults.loss !== undefined ? rawResults.loss.toFixed(4) : null,
                
                // Map the first chart back to Next.js state
                graphConfig: rawResults.charts && rawResults.charts.length > 0 ? rawResults.charts[0].config : null,
                graphData: rawResults.charts && rawResults.charts.length > 0 ? rawResults.charts[0].data : null,
            };
            
            
            setPipelineResult(mappedResults);
        }
        else {
            alert("⚠️ The pipeline finished, but returned empty results.");
        }
      } else {
        const errorData = await response.json();
        alert(`❌ AI Engine Error: ${errorData.detail}`);
      }
    } catch (error) {
      alert("❌ CRITICAL: Could not connect to the ML Engine.");
    } finally {
      setIsThinking(false);
    }
  };

  // ---> NEW: Secure Model Download <---
  const handleDownloadModel = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const response = await fetch("http://localhost:8000/api/download-model", {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        alert("❌ Model file not found. Ensure the pipeline successfully trained a model.");
        return;
      }

      // Convert the secure response stream into a browser download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "ai_pipeline_model.pkl"; // The name the file will save as
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error("Download failed:", error);
      alert("❌ Critical error while downloading the model.");
    }
  };

  const getEChartsOption = () => {
    if (!pipelineResult || !pipelineResult.graphData) return {};
    const chartType = pipelineResult.graphConfig.type; 
    const data = pipelineResult.graphData;
    const actualEChartType = chartType === 'correlation' ? 'scatter' : chartType;
    const isBarOrLine = actualEChartType === 'bar' || actualEChartType === 'line';
    const sortedData = [...data].sort((a, b) => a.x - b.x);

    return {
      tooltip: { trigger: isBarOrLine ? 'axis' : 'item', backgroundColor: '#fff', borderColor: '#000', borderWidth: 4, textStyle: { fontWeight: 'bold', color: '#000' } },
      grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
      xAxis: isBarOrLine
        ? { type: 'category', data: sortedData.map((d: any) => d.x), name: pipelineResult.graphConfig.xLabel, nameLocation: 'middle', nameGap: 30, axisLabel: { fontWeight: 'bold' } }
        : { type: 'value', name: pipelineResult.graphConfig.xLabel, nameLocation: 'middle', nameGap: 30, axisLabel: { fontWeight: 'bold' } },
      yAxis: { type: 'value', name: pipelineResult.graphConfig.yLabel, nameLocation: 'middle', nameGap: 40, axisLabel: { fontWeight: 'bold' } },
      series: [{
          type: actualEChartType,
          data: isBarOrLine ? sortedData.map((d: any) => d.y) : data.map((d: any) => [d.x, d.y]),
          itemStyle: { color: actualEChartType === 'scatter' ? '#facc15' : '#000', borderColor: '#000', borderWidth: actualEChartType === 'scatter' ? 2 : 0 },
          lineStyle: actualEChartType === 'line' ? { color: '#000', width: 4 } : undefined,
          symbolSize: actualEChartType === 'scatter' ? 12 : 8,
      }]
    };
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {/* ---> THINKING OVERLAY <--- */}
      {isThinking && (
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <Loader2 size={64} className="animate-spin text-purple-600 mb-4" />
          <h2 className="text-3xl font-black uppercase tracking-tighter">Llama 3 is thinking...</h2>
          <p className="font-bold text-gray-500 mt-2">Designing and executing your pipeline autonomously.</p>
        </div>
      )}

      {/* ---> RESULTS OVERLAY <--- */}
      {pipelineResult && !isThinking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white border-8 border-black shadow-[16px_16px_0px_#000] p-8 rounded-3xl max-w-2xl w-full text-center animate-in zoom-in duration-300 relative flex flex-col max-h-[90vh]">
            <button onClick={() => setPipelineResult(null)} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-red-200 border-4 border-black rounded-xl transition-all shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none z-10">
              <X size={24} strokeWidth={3} />
            </button>
            <div className="overflow-y-auto pr-2 custom-scrollbar">
              <div className="mx-auto w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mb-4 shadow-[6px_6px_0px_#000]">
                <Trophy size={40} className="text-black" />
              </div>
              <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter">Pipeline Complete</h2>
              
              {pipelineResult.score && pipelineResult.metric && (
                <div className="bg-green-100 border-4 border-black rounded-2xl p-6 mb-6 transform -rotate-1 shadow-[8px_8px_0px_#000] mt-6">
                  <p className="font-black text-gray-500 uppercase tracking-widest text-sm mb-1">{pipelineResult.metric}</p>
                  <p className="text-6xl font-black text-green-600">{pipelineResult.score}</p>
                </div>
              )}

              {/* ---> NEW DOWNLOAD BUTTON <--- */}
              {pipelineResult.score && (
                <button 
                  onClick={handleDownloadModel}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white font-black text-xl py-4 rounded-xl border-4 border-black shadow-[6px_6px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all mb-6 flex items-center justify-center gap-3"
                >
                  <Database size={24} />
                  DOWNLOAD .PKL MODEL
                </button>
              )}

              {pipelineResult.graphData && (
                <div className="h-96 w-full bg-[#fdfaf5] border-4 border-black rounded-2xl p-4 mb-6 shadow-[8px_8px_0px_#000] mt-6">
                  <h3 className="font-black mb-4 uppercase text-lg border-b-4 border-black pb-2 inline-block">
                    {pipelineResult.graphConfig.type} Plot
                  </h3>
                  <div className="h-[80%] w-full">
                    <ReactECharts option={getEChartsOption()} style={{ height: '100%', width: '100%' }} notMerge={true} />
                  </div>
                </div>
              )}
              <button onClick={() => setPipelineResult(null)} className="w-full bg-black text-white font-black text-xl py-4 rounded-xl border-4 border-transparent hover:bg-gray-800 transition-colors shadow-[6px_6px_0px_#ccc] active:translate-y-1 active:shadow-none mt-2">
                CLOSE RESULTS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="h-20 border-b-4 border-black bg-white flex items-center justify-between px-6 z-10 shadow-[0px_4px_0px_#000]">
        <div className="flex items-center gap-4">
          <Link href="/">
            <button className="p-2 border-2 border-black bg-gray-100 hover:bg-gray-200 shadow-[2px_2px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all rounded-md">
              <ArrowLeft size={24} strokeWidth={3} />
            </button>
          </Link>
          <h1 className="font-black text-2xl tracking-tighter hidden md:block">AI PIPELINE ENGINE</h1>
        </div>
        <UserButton />
      </header>

      <main className="flex-1 w-full h-full relative flex">
        <div className="flex-1 relative pb-32"> {/* Added padding for prompt bar */}
          {/* If no nodes, show an empty state prompt */}
          {nodes.length === 0 && !isThinking && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none z-10">
              <Bot size={80} className="mb-4 opacity-50" />
              <h2 className="text-2xl font-black">Waiting for instructions...</h2>
              <p className="font-bold">Select a dataset and tell the AI what to build below.</p>
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
            onNodeClick={(event: any, node: any) => setSelectedNode(node)} 
            onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
            nodesDraggable={false} // Disable dragging since AI builds it!
            nodesConnectable={false} 
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black shadow-[4px_4px_0px_#000] rounded-lg bg-white overflow-hidden [&>button]:border-black [&>button]:text-black" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          {/* ---> NEW AI PROMPT BAR <--- */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex flex-col md:flex-row gap-3 items-center">
              
              {/* Dataset Selector */}
              <select 
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                className="w-full md:w-1/3 border-4 border-black rounded-xl p-3 font-bold bg-gray-100 focus:ring-4 focus:ring-purple-300 outline-none cursor-pointer"
              >
                <option value="" disabled>1. Select Dataset</option>
                {availableDatasets.map((fileName) => (
                  <option key={fileName} value={fileName}>📄 {fileName}</option>
                ))}
              </select>

              {/* Prompt Input */}
              <input 
                type="text" 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="2. E.g. Clean the data and predict house prices using an AI model..." 
                className="w-full md:w-2/3 border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none" 
                onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
              />

              {/* Generate Button */}
              <button 
                onClick={handleAIGenerate}
                className="w-full md:w-auto flex items-center justify-center gap-2 border-4 border-black bg-purple-400 hover:bg-purple-500 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all px-8 py-3 rounded-xl font-black text-white"
              >
                <Sparkles fill="white" size={20} />
                GENERATE
              </button>

            </div>
          </div>
        </div>

        {/* Dynamic Slide-out Panel (Now Read-Only Inspector) */}
        <div className={`h-full bg-white border-l-4 border-black transition-all duration-300 ease-in-out z-20 ${selectedNode ? "w-80 translate-x-0" : "w-0 translate-x-full border-l-0"}`}>
          {selectedNode && (
            <div className="p-6 h-full flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
                <h2 className="text-xl font-black flex items-center gap-2"><Bot size={24} /> AI Decision</h2>
                <button onClick={() => setSelectedNode(null)} className="p-1 border-2 border-black rounded-md hover:bg-red-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                  <X size={20} strokeWidth={3} />
                </button>
              </div>

              <div className="bg-gray-100 border-4 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] mb-6">
                <p className="font-bold text-sm text-gray-500 mb-2">Node Type</p>
                <p className="font-black text-lg uppercase">{selectedNode.data.label}</p>
              </div>

              <div className="flex flex-col gap-4">
                <p className="font-black text-md border-b-2 border-gray-200 pb-2">Parameters Configured by Llama 3:</p>
                
                {Object.entries(selectedNode.data.config || {}).map(([key, value]: any) => (
                  <div key={key}>
                    <label className="font-bold text-sm text-gray-500 block mb-1 uppercase">{key}</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={typeof value === 'object' ? JSON.stringify(value) : value} 
                      className="w-full border-2 border-gray-300 bg-gray-50 rounded-lg p-2 font-bold text-gray-700 cursor-not-allowed" 
                    />
                  </div>
                ))}
                {Object.keys(selectedNode.data.config || {}).length === 0 && (
                  <p className="text-sm font-bold text-gray-400 italic">No specific parameters configured.</p>
                )}
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasBoard />
    </ReactFlowProvider>
  );
}