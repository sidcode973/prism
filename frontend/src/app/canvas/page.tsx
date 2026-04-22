"use client";

import React, { useCallback, useState, useEffect } from "react";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import ReactECharts from 'echarts-for-react'; // <-- NEW: Apache ECharts Import!
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Connection,
  Edge,
  ReactFlowProvider,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Play, Sparkles, BrainCircuit, Database, BarChart3, Trash2, Plus, X, Settings, FileText, SlidersHorizontal, Trophy } from "lucide-react";

// ==========================================
// 1. CUSTOM WIRE (EDGE)
// ==========================================
const NeoEdge = ({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd }: any) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          className="nodrag nopan"
        >
          <button
            onClick={() => setEdges((edges) => edges.filter((e) => e.id !== id))}
            className="bg-red-400 text-black border-2 border-black w-6 h-6 rounded-full flex items-center justify-center font-black text-xs hover:bg-red-500 shadow-[2px_2px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
          >
            X
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

// ==========================================
// 2. CUSTOM DRAGGABLE BLOCK (NODE)
// ==========================================
const NeoNode = ({ id, data }: { id: string, data: any }) => {
  const { setNodes, setEdges } = useReactFlow();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setNodes((nodes) => nodes.filter((node) => node.id !== id));
    setEdges((edges) => edges.filter((edge) => edge.source !== id && edge.target !== id));
  };

  return (
    <div className="border-4 border-black shadow-[6px_6px_0px_#000] rounded-xl p-4 min-w-[240px] bg-white hover:-translate-y-1 hover:shadow-[8px_8px_0px_#000] transition-all duration-200 group cursor-pointer">
      <Handle type="target" position={Position.Left} className="w-5 h-5 border-4 border-black bg-white -ml-2 hover:bg-yellow-300 transition-colors" />
      
      <div className="flex items-center justify-between mb-3 border-b-2 border-gray-200 pb-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border-2 border-black ${data.colorClass}`}>
             {data.icon}
          </div>
          <h3 className="font-black text-lg">{data.label}</h3>
        </div>
        <button onClick={handleDelete} className="opacity-50 hover:opacity-100 hover:bg-red-200 p-1 rounded-md transition-all text-red-600">
          <Trash2 size={18} strokeWidth={2.5} />
        </button>
      </div>
      
      <p className="text-sm font-bold text-gray-600 bg-gray-100 p-2 border-2 border-gray-300 rounded-md truncate">
        {data.description}
      </p>

      <Handle type="source" position={Position.Right} className="w-5 h-5 border-4 border-black bg-white -mr-2 hover:bg-yellow-300 transition-colors" />
    </div>
  );
};

const nodeTypes: any = { neoNode: NeoNode };
const edgeTypes: any = { neoEdge: NeoEdge };

// ==========================================
// 3. THE CANVAS BOARD LOGIC
// ==========================================
function CanvasBoard() {
  const { screenToFlowPosition } = useReactFlow();
  const { user } = useUser(); 
  const { getToken } = useAuth();
  
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [pipelineResult, setPipelineResult] = useState<any>(null);
  const [availableDatasets, setAvailableDatasets] = useState<string[]>([]);

  // Fetch the user's files when the Canvas loads
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
        console.error("Failed to fetch datasets", error);
      }
    };
    fetchDatasets();
  }, [getToken]);

  // Initial node has an empty config object ready to store settings
  const initialNodes: any[] = [
    { id: 'node_1', type: 'neoNode', position: { x: 50, y: 200 }, data: { label: 'Raw Data', description: 'Select a dataset', colorClass: 'bg-green-300', icon: <Database size={20} />, config: { fileName: '' } } }
  ];

  const [nodes, setNodes, onNodesChange] = useNodesState<any>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  const onConnect = useCallback((params: Connection | Edge) => {
    const customEdge = { ...params, type: 'neoEdge', animated: true, style: { stroke: 'black', strokeWidth: 4 } };
    setEdges((eds) => addEdge(customEdge, eds));
  }, [setEdges]);

  const addNode = (type: 'data' | 'clean' | 'graph' | 'train') => {
    const id = `node_${new Date().getTime()}`;
    const randomOffset = Math.floor(Math.random() * 50);
    const position = { x: 300 + randomOffset, y: 200 + randomOffset };

    let newNodeData: any = { config: {} }; 
    if (type === 'data') newNodeData = { ...newNodeData, label: 'Raw Data', description: 'Select a dataset...', colorClass: 'bg-green-300', icon: <Database size={20} />, config: { fileName: '' } };
    if (type === 'clean') newNodeData = { ...newNodeData, label: 'Clean Data', description: 'Configure cleaning...', colorClass: 'bg-blue-300', icon: <Sparkles size={20} />, config: { strategy: 'drop', columns: '' } };
    if (type === 'graph') newNodeData = { ...newNodeData, label: 'Plot Graph', description: 'Select graph type...', colorClass: 'bg-pink-300', icon: <BarChart3 size={20} />, config: { type: 'scatter', xAxis: '', yAxis: '' } };
    if (type === 'train') newNodeData = { ...newNodeData, label: 'Train Model', description: 'Select algorithm...', colorClass: 'bg-purple-300', icon: <BrainCircuit size={20} />, config: { algorithm: 'automl', target: '', split: 20 } };

    setNodes((nds: any) => [...nds, { id, type: 'neoNode', position, data: newNodeData }]);
  };

  const handleConfigChange = (key: string, value: any) => {
    if (!selectedNode) return;

    setNodes((nds: any) => nds.map((n: any) => {
      if (n.id === selectedNode.id) {
        // If they are updating the filename, also update the node's description visually
        const newDescription = key === 'fileName' && value ? value : (key === 'fileName' ? 'Select a dataset...' : n.data.description);
        return {
          ...n,
          data: { ...n.data, description: newDescription, config: { ...n.data.config, [key]: value } }
        };
      }
      return n;
    }));
    
    setSelectedNode((prev: any) => ({
      ...prev,
      data: { ...prev.data, config: { ...prev.data.config, [key]: value } }
    }));
  };

  const handleRunPipeline = async () => {
    console.log("🚀 Translating visual canvas to JSON Contract...");
    // 1. Identify what types of nodes we actually have on the board
    const nodeLabels = nodes.map(n => n.data.label);
    const hasData = nodeLabels.includes("Raw Data");
    const hasAction = nodeLabels.some(l => ["Clean Data", "Train Model", "Plot Graph"].includes(l));
    const hasConnections = edges.length > 0;

    // 2. The "Reality Check" Guard
    if (!hasData || !hasAction || !hasConnections) {
      alert("⚠️ Your pipeline is incomplete! You need to connect a 'Raw Data' block to at least one action block (Clean, Graph, or Train) to run.");
      return;
    }
    let uploadedFileName = ""; 

    const formattedNodes = nodes.map((node: any) => {
      let actionType = "unknown";
      if (node.data.label === "Clean Data") actionType = "clean_data";
      if (node.data.label === "Train Model") actionType = "train_model";
      if (node.data.label === "Plot Graph") actionType = "plot_graph"; 
      if (node.data.label === "Raw Data") {
        actionType = "load_dataset";
        if (node.data.config?.fileName) uploadedFileName = node.data.config.fileName;
      }

      return {
        node_id: node.id,
        action_type: actionType,
        parameters: {
          ui_label: node.data.label, 
          description: node.data.description,
          ...node.data.config 
        }
      };
    });

    if (!uploadedFileName) {
      alert("⚠️ Hold up! You need to specify a cloud dataset name in the 'Raw Data' node before running.");
      return; 
    }

    const executionOrder = edges.map((edge: any) => edge.source);
    const lastEdge: any = edges[edges.length - 1];
    if (lastEdge) executionOrder.push(lastEdge.target);

    const userId = user?.id || "unauthenticated_user";

    const masterContract = {
      metadata: { 
        user_id: userId,
        project_id: "prj_552xyz", 
        tier: "free", 
        max_time_budget_seconds: 300 
      },
      dataset: { 
        file_name: uploadedFileName, 
        minio_path: `s3://prism-data/${userId}/${uploadedFileName}`
      },
      nodes: formattedNodes,
      execution_order: Array.from(new Set(executionOrder))
    };

    try {
      const token = await getToken();

      const response = await fetch("http://localhost:8000/api/pipeline/run", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(masterContract),
      });
      
      if (response.ok) {
        const data = await response.json();
        setPipelineResult(data.results);
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.detail ? JSON.stringify(errorData.detail, null, 2) : JSON.stringify(errorData);
        alert(`❌ FastAPI Rejected it!\n\n${errorMessage}`);
      }
    } catch (error) {
      alert("❌ CRITICAL: Could not connect to FastAPI. Is the backend running?");
    }
  };

  // ---> NEW: Helper to generate the ECharts configuration based on FastAPI data <---
  // ---> NEW: Updated Helper to handle Lines, Bars, and Scatters properly <---
  const getEChartsOption = () => {
    if (!pipelineResult || !pipelineResult.graphData) return {};

    const chartType = pipelineResult.graphConfig.type; 
    const data = pipelineResult.graphData;

    // Fallback for correlation until we build a 2D matrix backend
    const actualEChartType = chartType === 'correlation' ? 'scatter' : chartType;
    const isBarOrLine = actualEChartType === 'bar' || actualEChartType === 'line';

    // Line charts look like scribbles if the X-axis isn't sorted lowest to highest!
    const sortedData = [...data].sort((a, b) => a.x - b.x);

    return {
      tooltip: {
        trigger: isBarOrLine ? 'axis' : 'item',
        backgroundColor: '#fff',
        borderColor: '#000',
        borderWidth: 4,
        textStyle: { fontWeight: 'bold', color: '#000' }
      },
      grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
      xAxis: isBarOrLine
        ? { type: 'category', data: sortedData.map((d: any) => d.x), name: pipelineResult.graphConfig.xLabel, nameLocation: 'middle', nameGap: 30, axisLabel: { fontWeight: 'bold' } }
        : { type: 'value', name: pipelineResult.graphConfig.xLabel, nameLocation: 'middle', nameGap: 30, axisLabel: { fontWeight: 'bold' } },
      yAxis: { 
        type: 'value', 
        name: pipelineResult.graphConfig.yLabel, 
        nameLocation: 'middle', 
        nameGap: 40,
        axisLabel: { fontWeight: 'bold' }
      },
      series: [
        {
          type: actualEChartType,
          data: isBarOrLine ? sortedData.map((d: any) => d.y) : data.map((d: any) => [d.x, d.y]),
          itemStyle: { 
            color: actualEChartType === 'scatter' ? '#facc15' : '#000',
            borderColor: '#000',
            borderWidth: actualEChartType === 'scatter' ? 2 : 0
          },
          lineStyle: actualEChartType === 'line' ? { color: '#000', width: 4 } : undefined,
          symbolSize: actualEChartType === 'scatter' ? 12 : 8,
        }
      ]
    };
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#fdfaf5] text-black font-sans overflow-hidden">
      
      {/* ---> MASSIVE RESULTS OVERLAY MODAL (UPDATED FOR GRAPHS) <--- */}
      {pipelineResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white border-8 border-black shadow-[16px_16px_0px_#000] p-8 rounded-3xl max-w-2xl w-full text-center animate-in zoom-in duration-300 relative flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setPipelineResult(null)}
              className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-red-200 border-4 border-black rounded-xl transition-all shadow-[4px_4px_0px_#000] active:translate-y-1 active:translate-x-1 active:shadow-none z-10"
            >
              <X size={24} strokeWidth={3} />
            </button>
            
            {/* Scrollable container inside modal to prevent overflow if they graph AND train */}
            <div className="overflow-y-auto pr-2 custom-scrollbar">
              <div className="mx-auto w-20 h-20 bg-yellow-300 border-4 border-black rounded-full flex items-center justify-center mb-4 shadow-[6px_6px_0px_#000]">
                <Trophy size={40} className="text-black" />
              </div>
              
              <h2 className="text-4xl font-black mb-2 uppercase tracking-tighter">Pipeline Complete</h2>
              <p className="text-lg font-bold text-gray-600 mb-6">Your data has been processed successfully.</p>
              
              {/* Conditional Score UI */}
              {pipelineResult.score && pipelineResult.metric && (
                <div className="bg-green-100 border-4 border-black rounded-2xl p-6 mb-6 transform -rotate-1 shadow-[8px_8px_0px_#000]">
                  <p className="font-black text-gray-500 uppercase tracking-widest text-sm mb-1">{pipelineResult.metric}</p>
                  <p className="text-6xl font-black text-green-600">{pipelineResult.score}</p>
                </div>
              )}

              {/* Conditional Graph UI */}
              {pipelineResult.graphData && (
                <div className="h-96 w-full bg-[#fdfaf5] border-4 border-black rounded-2xl p-4 mb-6 shadow-[8px_8px_0px_#000]">
                  <h3 className="font-black mb-4 uppercase text-lg border-b-4 border-black pb-2 inline-block">
                    {pipelineResult.graphConfig.type} Plot
                  </h3>
                  <div className="h-[80%] w-full">
                    <ReactECharts 
                      option={getEChartsOption()} 
                      style={{ height: '100%', width: '100%' }} 
                      notMerge={true}
                    />
                  </div>
                </div>
              )}
              
              <button 
                onClick={() => setPipelineResult(null)}
                className="w-full bg-black text-white font-black text-xl py-4 rounded-xl border-4 border-transparent hover:bg-gray-800 transition-colors shadow-[6px_6px_0px_#ccc] active:translate-y-1 active:shadow-none mt-2"
              >
                AWESOME
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
          <h1 className="font-black text-2xl tracking-tighter hidden md:block">PIPELINE CANVAS</h1>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleRunPipeline}
            className="flex items-center gap-2 border-4 border-black bg-yellow-300 hover:bg-yellow-400 shadow-[4px_4px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all px-6 py-2 rounded-xl font-black"
          >
            <Play fill="black" stroke="black" size={20} />
            RUN PIPELINE
          </button>
          
          <div className="border-2 border-black rounded-full shadow-[2px_2px_0px_#000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all">
            <UserButton />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full h-full relative flex">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(event: any, node: any) => setSelectedNode(node)} 
            onPaneClick={() => setSelectedNode(null)} 
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView
          >
            <Background color="#000" gap={24} size={2} />
            <Controls className="border-2 border-black shadow-[4px_4px_0px_#000] rounded-lg bg-white overflow-hidden [&>button]:border-black [&>button]:text-black" />
            <MiniMap className="border-4 border-black shadow-[4px_4px_0px_#000] rounded-xl bg-white" nodeColor="#000" maskColor="rgba(0,0,0,0.1)" />
          </ReactFlow>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 bg-white border-4 border-black shadow-[8px_8px_0px_#000] rounded-2xl p-3 flex gap-3">
            <ToolButton onClick={() => addNode('data')} color="bg-green-300" icon={<Database size={20} />} label="Data" />
            <ToolButton onClick={() => addNode('clean')} color="bg-blue-300" icon={<Sparkles size={20} />} label="Clean" />
            <ToolButton onClick={() => addNode('graph')} color="bg-pink-300" icon={<BarChart3 size={20} />} label="Graph" />
            <ToolButton onClick={() => addNode('train')} color="bg-purple-300" icon={<BrainCircuit size={20} />} label="Train" />
          </div>
        </div>

        {/* Dynamic Slide-out Panel */}
        <div className={`h-full bg-white border-l-4 border-black transition-all duration-300 ease-in-out z-20 ${selectedNode ? "w-96 translate-x-0" : "w-0 translate-x-full border-l-0"}`}>
          {selectedNode && (
            <div className="p-6 h-full flex flex-col overflow-y-auto w-96">
              
              <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
                <h2 className="text-2xl font-black flex items-center gap-2"><Settings size={28} /> {selectedNode.data.label}</h2>
                <button onClick={() => setSelectedNode(null)} className="p-1 border-2 border-black rounded-md hover:bg-red-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1">
                  <X size={20} strokeWidth={3} />
                </button>
              </div>

              {/* === RAW DATA PANEL (ENTERPRISE DROPDOWN) === */}
              {selectedNode.data.label === 'Raw Data' && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="font-black text-lg mb-2 block flex items-center gap-2"><FileText size={20}/> Select Cloud Dataset</label>
                    <select 
                      value={selectedNode.data.config?.fileName || ''}
                      onChange={(e) => handleConfigChange('fileName', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-green-300 outline-none shadow-[4px_4px_0px_#000] bg-white cursor-pointer" 
                    >
                      <option value="" disabled>-- Choose a dataset --</option>
                      {availableDatasets.length === 0 && (
                        <option value="" disabled>No datasets found. Upload one first!</option>
                      )}
                      {availableDatasets.map((fileName) => (
                        <option key={fileName} value={fileName}>
                          📄 {fileName}
                        </option>
                      ))}
                    </select>
                    <p className="text-sm font-bold text-gray-500 mt-2">Choose a file from your secure cloud vault.</p>
                  </div>
                </div>
              )}

              {/* === CLEAN DATA PANEL === */}
              {selectedNode.data.label === 'Clean Data' && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="font-black text-lg mb-2 block">Missing Values Strategy</label>
                    <select 
                      value={selectedNode.data.config?.strategy || 'drop'}
                      onChange={(e) => handleConfigChange('strategy', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold bg-white focus:ring-4 focus:ring-blue-300 outline-none shadow-[4px_4px_0px_#000]"
                    >
                      <option value="drop">Drop Rows with Nulls</option>
                      <option value="mean">Impute Mean (Average)</option>
                      <option value="median">Impute Median</option>
                      <option value="mode">Impute Mode (Most Frequent)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-black text-lg mb-2 block">Specific Columns (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. age, income" 
                      value={selectedNode.data.config?.columns || ''}
                      onChange={(e) => handleConfigChange('columns', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-blue-300 outline-none shadow-[4px_4px_0px_#000]" 
                    />
                    <p className="text-sm font-bold text-gray-500 mt-2">Leave blank to apply to entire dataset.</p>
                  </div>
                </div>
              )}

              {/* === TRAIN MODEL PANEL === */}
              {selectedNode.data.label === 'Train Model' && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="font-black text-lg mb-2 block text-purple-600 flex items-center gap-2"><SlidersHorizontal size={20}/> Target Variable</label>
                    <input 
                      type="text" 
                      placeholder="e.g. churn_rate" 
                      value={selectedNode.data.config?.target || ''}
                      onChange={(e) => handleConfigChange('target', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold focus:ring-4 focus:ring-purple-300 outline-none shadow-[4px_4px_0px_#000]" 
                    />
                    <p className="text-sm font-bold text-gray-500 mt-2">The column you want the AI to predict.</p>
                  </div>
                  <div>
                    <label className="font-black text-lg mb-2 block">Algorithm</label>
                    <select 
                      value={selectedNode.data.config?.algorithm || 'automl'}
                      onChange={(e) => handleConfigChange('algorithm', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold bg-white focus:ring-4 focus:ring-purple-300 outline-none shadow-[4px_4px_0px_#000]"
                    >
                      <option value="automl">⚡ Groq AutoML (Best Model)</option>
                      <option value="xgboost">XGBoost Classifier</option>
                      <option value="random_forest">Random Forest</option>
                      <option value="logistic">Logistic Regression</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-black text-lg mb-2 flex justify-between">
                      <span>Test Data Split</span>
                      <span className="text-purple-600">{selectedNode.data.config?.split || 20}%</span>
                    </label>
                    <input 
                      type="range" min="10" max="50" step="5"
                      value={selectedNode.data.config?.split || 20}
                      onChange={(e) => handleConfigChange('split', e.target.value)}
                      className="w-full accent-purple-600"
                    />
                  </div>
                </div>
              )}

              {/* === PLOT GRAPH PANEL === */}
              {selectedNode.data.label === 'Plot Graph' && (
                <div className="flex flex-col gap-6">
                  <div>
                    <label className="font-black text-lg mb-2 block">Chart Type</label>
                    <select 
                      value={selectedNode.data.config?.type || 'scatter'}
                      onChange={(e) => handleConfigChange('type', e.target.value)}
                      className="w-full border-4 border-black rounded-xl p-3 font-bold bg-white focus:ring-4 focus:ring-pink-300 outline-none shadow-[4px_4px_0px_#000]"
                    >
                      <option value="scatter">Scatter Plot</option>
                      <option value="bar">Bar Chart</option>
                      <option value="line">Line Graph</option>
                      <option value="correlation">Correlation Heatmap</option>
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="font-black text-sm mb-2 block">X-Axis</label>
                      <input 
                        type="text" placeholder="col_1"
                        value={selectedNode.data.config?.xAxis || ''}
                        onChange={(e) => handleConfigChange('xAxis', e.target.value)}
                        className="w-full border-4 border-black rounded-xl p-2 font-bold shadow-[2px_2px_0px_#000] focus:ring-4 focus:ring-pink-300 outline-none" 
                      />
                    </div>
                    <div className="flex-1">
                      <label className="font-black text-sm mb-2 block">Y-Axis</label>
                      <input 
                        type="text" placeholder="col_2" 
                        value={selectedNode.data.config?.yAxis || ''}
                        onChange={(e) => handleConfigChange('yAxis', e.target.value)}
                        className="w-full border-4 border-black rounded-xl p-2 font-bold shadow-[2px_2px_0px_#000] focus:ring-4 focus:ring-pink-300 outline-none" 
                      />
                    </div>
                  </div>
                </div>
              )}

              <button className="mt-auto bg-black text-white font-black py-4 rounded-xl hover:bg-gray-800 transition-colors w-full border-4 border-transparent shadow-[4px_4px_0px_#ccc] active:translate-y-1 active:shadow-none">
                SAVE NODE
              </button>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

function ToolButton({ onClick, color, icon, label }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 ${color} border-2 border-black px-4 py-2 rounded-xl font-black text-sm hover:brightness-105 active:translate-x-1 active:translate-y-1 shadow-[2px_2px_0px_#000] active:shadow-none transition-all`}>
      <Plus size={16} strokeWidth={4} /> {icon} {label}
    </button>
  );
}

export default function CanvasPage() {
  return (
    <ReactFlowProvider>
      <CanvasBoard />
    </ReactFlowProvider>
  );
}