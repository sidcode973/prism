import React, { useState, useEffect, useRef } from 'react';
import { Settings, Trash2, X, SlidersHorizontal, Plus } from "lucide-react";

// ==========================================
// CUSTOM SEARCHABLE DROPDOWN (Neo-Brutalist)
// ==========================================
const SearchableSelect = ({ value, onChange, options, placeholder, className }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt: string) =>
    opt.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className={className}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border-2 border-black rounded-lg shadow-[4px_4px_0px_#000] max-h-48 overflow-y-auto">
          {filteredOptions.map((opt: string) => (
            <li
              key={opt}
              className="p-2 text-xs font-bold text-black hover:bg-yellow-200 cursor-pointer border-b-2 border-gray-100 last:border-b-0 transition-colors"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


export default function Inspector({ selectedNode, setSelectedNode, handleDeleteNode, updateNodeConfig, availableDatasets, datasetColumns }: any) {
  const [tempDropCol, setTempDropCol] = useState("");
  const [tempImputeCol, setTempImputeCol] = useState("");
  const [tempImputeRule, setTempImputeRule] = useState("mean");
  const [tempCustomVal, setTempCustomVal] = useState("");
  const [tempEncodeCol, setTempEncodeCol] = useState("");

  if (!selectedNode) return null;
  const config = selectedNode.data.config || {};

  const handleArrayAdd = (key: string, value: string, setTempVal: any) => {
    if (!value) return;
    const currentVal = config[key];
    const currentList = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
    
    if (!currentList.includes(value)) {
      updateNodeConfig(key, [...currentList, value]);
    }
    setTempVal("");
  };

  const removeArrayItem = (key: string, valueToRemove: string) => {
    const currentVal = config[key];
    const currentList = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
    updateNodeConfig(key, currentList.filter((c: string) => c !== valueToRemove));
  };

  const handleAddImputeRule = () => {
    if (!tempImputeCol) return;
    const val = tempImputeRule === "custom" ? tempCustomVal : tempImputeRule;
    updateNodeConfig('impute_rules', { ...(config.impute_rules || {}), [tempImputeCol]: val });
    setTempImputeCol(""); setTempCustomVal("");
  };

  const removeImputeRule = (colToRemove: string) => {
    const updated = { ...(config.impute_rules || {}) };
    delete updated[colToRemove];
    updateNodeConfig('impute_rules', updated);
  };

  return (
    <div className="absolute top-0 right-0 h-full bg-white border-l-4 border-black transition-transform duration-300 ease-in-out z-30 shadow-[-4px_0px_0px_rgba(0,0,0,0.1)] w-[380px] translate-x-0">
      
      <div className="p-6 h-full flex flex-col overflow-y-auto pb-32">
        <div className="flex items-center justify-between mb-8 border-b-4 border-black pb-4">
          <h2 className="text-xl font-black flex items-center gap-2"><Settings size={24} /> Inspector</h2>
          <div className="flex gap-2">
            <button onClick={handleDeleteNode} title="Delete Node" className="p-1 border-2 border-black rounded-md bg-white hover:bg-red-400 hover:text-white transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1"><Trash2 size={20} strokeWidth={3} /></button>
            <button onClick={() => setSelectedNode(null)} title="Close Inspector" className="p-1 border-2 border-black rounded-md hover:bg-gray-200 transition-all shadow-[2px_2px_0px_#000] active:shadow-none active:translate-x-1 active:translate-y-1"><X size={20} strokeWidth={3} /></button>
          </div>
        </div>

        <div className="bg-gray-100 border-4 border-black rounded-xl p-4 shadow-[4px_4px_0px_#000] mb-6">
          <p className="font-bold text-sm text-gray-500 mb-2">Node Type</p>
          <p className="font-black text-lg uppercase">{selectedNode.data.label}</p>
        </div>

        <div className="flex flex-col gap-5">
          <p className="font-black text-md border-b-2 border-gray-200 pb-2">Active Configuration:</p>

          {selectedNode.data.action_type === 'fix_csv' && (
            <>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Target Delimiter</label>
                <input type="text" value={config.true_delimiter || ''} onChange={(e) => updateNodeConfig('true_delimiter', e.target.value)} placeholder="e.g., , or ;" className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" />
              </div>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Replace Delimiters (Comma Separated)</label>
                <input type="text" value={Array.isArray(config.bad_delimiters_to_replace) ? config.bad_delimiters_to_replace.join(',') : (config.bad_delimiters_to_replace || '')} onChange={(e) => updateNodeConfig('bad_delimiters_to_replace', e.target.value.split(','))} placeholder="e.g., |, \t" className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" />
              </div>
            </>
          )}

          {selectedNode.data.action_type === 'clean_data' && (
            <>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Drop Specific Columns</label>
                <div className="flex gap-2 mb-2">
                  <SearchableSelect 
                    value={tempDropCol} 
                    onChange={setTempDropCol} 
                    options={datasetColumns} 
                    placeholder="Pick or type column" 
                    className="flex-1 border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" 
                  />
                  <button onClick={() => handleArrayAdd('drop_columns', tempDropCol, setTempDropCol)} className="p-2 border-2 border-black bg-blue-300 hover:bg-blue-400 rounded-lg"><Plus size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(config.drop_columns) ? config.drop_columns : []).map((c: string) => (
                    <span key={c} className="bg-gray-200 border-2 border-black rounded px-2 py-1 text-xs font-bold flex items-center gap-1">{c} <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => removeArrayItem('drop_columns', c)} /></span>
                  ))}
                </div>
              </div>

              <div className="border-t-2 border-gray-200 pt-4">
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Custom Impute Rules</label>
                <div className="flex flex-col gap-2 mb-2 bg-gray-50 p-2 border-2 border-black rounded-lg">
                  <SearchableSelect 
                    value={tempImputeCol} 
                    onChange={setTempImputeCol} 
                    options={datasetColumns} 
                    placeholder="Target Column..." 
                    className="w-full border-2 border-black rounded p-1.5 font-bold text-xs outline-none focus:bg-yellow-100" 
                  />
                  <select value={tempImputeRule} onChange={(e) => setTempImputeRule(e.target.value)} className="w-full border-2 border-black rounded p-1.5 font-bold text-xs outline-none">
                    <option value="mean">Mean (Average)</option>
                    <option value="median">Median</option>
                    <option value="mode">Mode (Frequent)</option>
                    <option value="custom">Custom Value...</option>
                  </select>
                  {tempImputeRule === "custom" && <input type="text" value={tempCustomVal} onChange={(e) => setTempCustomVal(e.target.value)} placeholder="Type custom value..." className="w-full border-2 border-black rounded p-1.5 font-bold text-xs outline-none" />}
                  <button onClick={handleAddImputeRule} className="w-full bg-blue-300 border-2 border-black rounded font-bold text-xs p-1 flex items-center justify-center gap-1"><Plus size={14}/> Add Rule</button>
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(config.impute_rules || {}).map(([col, rule]: any) => (
                    <div key={col} className="bg-white border-2 border-black rounded p-2 text-xs font-bold flex items-center justify-between shadow-[2px_2px_0px_#000]">
                      <span><span className="text-blue-600">{col}</span> → {rule}</span>
                      <X size={14} className="cursor-pointer hover:text-red-500" onClick={() => removeImputeRule(col)} /> 
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Auto Purge Empty Columns</label>
                <select value={config.auto_purge?.toString() || 'true'} onChange={(e) => updateNodeConfig('auto_purge', e.target.value === 'true')} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"><option value="true">Yes (Delete 90%+ empty columns)</option><option value="false">No (Keep all columns)</option></select>
              </div>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Smart Type Coercion</label>
                <select value={config.coerce_types?.toString() || 'true'} onChange={(e) => updateNodeConfig('coerce_types', e.target.value === 'true')} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"><option value="true">Yes (Fix currency strings to numbers)</option><option value="false">No (Leave strings alone)</option></select>
              </div>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Remove Duplicates</label>
                <select value={config.remove_duplicates?.toString() || 'true'} onChange={(e) => updateNodeConfig('remove_duplicates', e.target.value === 'true')} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"><option value="true">Yes (Drop exact duplicate rows)</option><option value="false">No (Keep duplicates)</option></select>
              </div>
            </>
          )}

          {selectedNode.data.action_type === 'feature_engineer' && (
            <>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase text-red-500">Target Column (Required)</label>
                <SearchableSelect 
                  value={config.target_column || ''} 
                  onChange={(val: string) => updateNodeConfig('target_column', val)} 
                  options={datasetColumns} 
                  placeholder="Type or Select Target" 
                  className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-red-100 outline-none" 
                />
              </div>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Encode Categoricals (OHE)</label>
                <select value={config.encode_categoricals?.toString() || 'true'} onChange={(e) => updateNodeConfig('encode_categoricals', e.target.value === 'true')} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"><option value="true">Auto-Encode All Valid Strings</option><option value="false">Manual Selection Only</option></select>
              </div>
              
              {config.encode_categoricals?.toString() === 'false' && (
                <div>
                  <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Explicit Encode Columns</label>
                  <div className="flex gap-2 mb-2">
                    <SearchableSelect 
                      value={tempEncodeCol} 
                      onChange={setTempEncodeCol} 
                      options={datasetColumns} 
                      placeholder="Pick column..." 
                      className="flex-1 border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" 
                    />
                    <button onClick={() => handleArrayAdd('manual_encode_cols', tempEncodeCol, setTempEncodeCol)} className="p-2 border-2 border-black bg-blue-300 hover:bg-blue-400 rounded-lg"><Plus size={16} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(config.manual_encode_cols) ? config.manual_encode_cols : []).map((c: string) => (
                      <span key={c} className="bg-gray-200 border-2 border-black rounded px-2 py-1 text-xs font-bold flex items-center gap-1">{c} <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => removeArrayItem('manual_encode_cols', c)} /></span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Feature Scaling</label>
                <select value={config.scale_method || 'none'} onChange={(e) => updateNodeConfig('scale_method', e.target.value)} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white"><option value="none">None</option><option value="standard">Standard Scaling (Z-Score)</option><option value="minmax">Min-Max Scaling</option></select>
              </div>
            </>
          )}

          {selectedNode.data.action_type === 'train_model' && (
            <>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase text-red-500">Target Column (Required)</label>
                <SearchableSelect 
                  value={config.target_column || ''} 
                  onChange={(val: string) => updateNodeConfig('target_column', val)} 
                  options={datasetColumns} 
                  placeholder="Type or Select Target" 
                  className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-red-100 outline-none" 
                />
              </div>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Evaluation Metric</label>
                <select value={config.metric || 'auto'} onChange={(e) => updateNodeConfig('metric', e.target.value)} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white">
                  <option value="auto">🧠 Auto-Detect</option>
                  <optgroup label="Regression"><option value="r2">R-Squared (R2)</option><option value="mae">Mean Absolute Error (MAE)</option><option value="rmse">Root Mean Squared Error (RMSE)</option></optgroup>
                  <optgroup label="Classification"><option value="accuracy">Accuracy</option><option value="f1">F1 Score</option></optgroup>
                </select>
              </div>
              <div className="bg-purple-100 p-3 rounded-xl border-4 border-black shadow-[4px_4px_0px_#000] flex flex-col gap-3">
                <h4 className="font-black uppercase text-sm flex items-center gap-2"><SlidersHorizontal size={16}/> Train / Test Split</h4>
                <div>
                  <div className="flex justify-between font-bold text-xs mb-1">
                    <span>Train: {100 - (config.test_split_ratio || 0) * 100}%</span>
                    <span>Test: {(config.test_split_ratio || 0) * 100}%</span>
                  </div>
                  <input type="range" min="0" max="0.5" step="0.05" value={config.test_split_ratio || 0} onChange={(e) => updateNodeConfig('test_split_ratio', parseFloat(e.target.value))} className={`w-full accent-purple-600 ${config.test_dataset_id ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={!!config.test_dataset_id} />
                </div>
                <div className="border-t-2 border-black pt-2 mt-1">
                  <label className="font-bold text-xs text-gray-700 block mb-1 uppercase">Explicit Test Dataset</label>
                  <select value={config.test_dataset_id || ''} onChange={(e) => updateNodeConfig('test_dataset_id', e.target.value)} className="w-full border-2 border-black rounded-lg p-1.5 font-bold text-xs focus:bg-white outline-none cursor-pointer bg-gray-50">
                    <option value="">(None - Use Split Slider)</option>
                    {availableDatasets.map((ds: any) => <option key={ds.id} value={ds.id}>{ds.file_name}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {selectedNode.data.action_type === 'generate_plot' && (
            <>
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Chart Type</label>
                <select value={config.chart_type || 'scatter'} onChange={(e) => updateNodeConfig('chart_type', e.target.value)} className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none cursor-pointer bg-white">
                  <option value="scatter">📍 Scatter Plot</option>
                  <option value="bar">📊 Bar Chart</option>
                  <option value="histogram">📉 Histogram</option>
                  <option value="boxplot">📦 Boxplot</option>
                  <option value="heatmap">🔥 Heatmap</option>
                </select>
              </div>
              
              <div>
                <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Chart Title</label>
                <input type="text" value={config.title || ''} onChange={(e) => updateNodeConfig('title', e.target.value)} placeholder="Auto-generated if empty" className="w-full border-2 border-black rounded-lg p-2 font-bold text-sm focus:bg-yellow-100 outline-none" />
              </div>

              {config.chart_type !== 'heatmap' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">X Axis / Main</label>
                    <SearchableSelect 
                      value={config.x_column || ''} 
                      onChange={(val: string) => updateNodeConfig('x_column', val)} 
                      options={datasetColumns} 
                      placeholder="Col..." 
                      className="w-full border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" 
                    />
                  </div>
                  {config.chart_type !== 'histogram' && (
                    <div className="flex-1">
                      <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Y Axis (Target)</label>
                      <SearchableSelect 
                        value={config.y_column || ''} 
                        onChange={(val: string) => updateNodeConfig('y_column', val)} 
                        options={datasetColumns} 
                        placeholder="Col... (Optional)" 
                        className="w-full border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" 
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 🛠️ FIX FOR OBS 2: HISTOGRAM COLOR PARAMETER */}
              {config.chart_type === 'histogram' && (
                <>
                  <div>
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Number of Bins</label>
                    <input type="number" value={config.bins || 20} onChange={(e) => updateNodeConfig('bins', parseInt(e.target.value))} className="w-full border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" />
                  </div>
                  <div>
                    <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Bar Color (Hex/Name)</label>
                    <input type="text" value={config.color || '#5470c6'} onChange={(e) => updateNodeConfig('color', e.target.value)} placeholder="#5470c6 or red" className="w-full border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" />
                  </div>
                </>
              )}

              {['scatter', 'boxplot', 'bar'].includes(config.chart_type || 'scatter') && (
                <div>
                  <label className="font-bold text-xs text-gray-500 block mb-1 uppercase">Color / Group By</label>
                  <SearchableSelect 
                    value={config.color_column || ''} 
                    onChange={(val: string) => updateNodeConfig('color_column', val)} 
                    options={datasetColumns} 
                    placeholder="Optional category col" 
                    className="w-full border-2 border-black rounded-lg p-2 font-bold text-xs focus:bg-yellow-100 outline-none" 
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}