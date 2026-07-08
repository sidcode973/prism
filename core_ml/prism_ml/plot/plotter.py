import polars as pl
import numpy as np
import polars.selectors as cs
from typing import Dict, Any
from prism_ml.exceptions import PlottingConfigurationError

class PrismPlotter:
    def __init__(self):
        print("📊 Prism Plotter Initialized")
        # ECharts Canvas handles ~15k-20k points smoothly. 
        self.MAX_SAFE_ROWS = 15000 
        # Minimum points needed to actually make a meaningful chart
        self.MIN_REQUIRED_ROWS = 2 

    def _extract_column(self, parameters: Dict[str, Any], df: pl.DataFrame, known_keys: list) -> str:
        """
        The Ultimate Fallback: 
        1. Tries to find the column using common AI keys.
        2. If that fails, it scans ALL parameter values to see if the AI just dumped a valid column name somewhere.
        """
        # 1. Try the usual suspects
        for key in known_keys:
            val = parameters.get(key)
            if val and val in df.columns:
                return val
        
        # 2. The Scanner: Did the AI mention a valid column name ANYWHERE in the JSON?
        for key, val in parameters.items():
            if isinstance(val, str) and val in df.columns:
                print(f"🕵️‍♂️ AI Scanner found valid column '{val}' hiding inside key '{key}'!")
                return val
                
        return None

    def generate_plot(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Routes the request to the correct charting engine.
        """
        chart_type = parameters.get("chart_type")
        if not chart_type:
            raise PlottingConfigurationError(node_id, "Missing 'chart_type' in parameters.")

        print(f"📈 Generating '{chart_type}' plot for node {node_id}...")

        # The Routing Hub
        if chart_type == "scatter":
            return self._build_scatter(node_id, df, parameters)
        elif chart_type == "bar":
            return self._build_bar(node_id, df, parameters)
        elif chart_type == "histogram":
            return self._build_histogram(node_id, df, parameters)
        elif chart_type == "boxplot":
            return self._build_boxplot(node_id, df, parameters)
        elif chart_type == "heatmap":
            return self._build_heatmap(node_id, df)
        else:
            raise PlottingConfigurationError(node_id, f"Unsupported chart type: '{chart_type}'")

    # ==========================================
    # CHART BUILDERS (The Math Muscles)
    # ==========================================

    def _build_scatter(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        x_col = self._extract_column(parameters, df, ["x_col", "x", "x_axis"])
        y_col = self._extract_column(parameters, df, ["y_col", "y", "y_axis"])

        # If it still couldn't find them, scan for any two valid columns
        if not x_col or not y_col:
            valid_cols = [v for v in parameters.values() if isinstance(v, str) and v in df.columns]
            if not x_col and len(valid_cols) > 0: x_col = valid_cols[0]
            if not y_col and len(valid_cols) > 1: y_col = valid_cols[1]

        if not x_col or not y_col:
            raise PlottingConfigurationError(node_id, f"Scatter plots require 2 valid columns. AI provided: {parameters}")

        plot_df = df.drop_nulls(subset=[x_col, y_col])
        if plot_df.height < self.MIN_REQUIRED_ROWS:
             raise PlottingConfigurationError(node_id, f"Not enough valid data to plot {x_col} vs {y_col}.")

        if plot_df.height > self.MAX_SAFE_ROWS:
            print(f"⚠️ Downsampling {plot_df.height} rows to {self.MAX_SAFE_ROWS} for UI performance.")
            plot_df = plot_df.sample(n=self.MAX_SAFE_ROWS, seed=42)

        data_points = plot_df.select([x_col, y_col]).to_numpy().tolist()

        return {
            "chart_type": "scatter",
            "title": f"{y_col} vs {x_col}",
            "echarts_payload": {
                "tooltip": {"trigger": "item"},
                "xAxis": {"type": "value", "name": x_col},
                "yAxis": {"type": "value", "name": y_col},
                "series": [{"type": "scatter", "data": data_points}]
            }
        }

    def _build_bar(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        category_col = self._extract_column(parameters, df, ["category_col", "x_col", "category", "column_name", "column"])
        
        if not category_col:
             raise PlottingConfigurationError(node_id, f"Bar charts require a valid category column. AI provided: {parameters}")

        plot_df = df.drop_nulls(subset=[category_col])
        if plot_df.height == 0:
            raise PlottingConfigurationError(node_id, f"No valid data found in '{category_col}'.")

        value_counts = plot_df.group_by(category_col).count().sort("count", descending=True)
        categories = value_counts[category_col].to_list()
        counts = value_counts["count"].to_list()

        return {
            "chart_type": "bar",
            "title": f"Count of {category_col}",
            "echarts_payload": {
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": categories, "name": category_col},
                "yAxis": {"type": "value", "name": "Count"},
                "series": [{"type": "bar", "data": counts}]
            }
        }

    def _build_histogram(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        target_col = self._extract_column(parameters, df, ["target_col", "x_col", "column_name", "column"])
        
        if not target_col:
             raise PlottingConfigurationError(node_id, f"Histograms require a valid target column. AI provided: {parameters}")

        plot_df = df.drop_nulls(subset=[target_col])
        if plot_df.height < self.MIN_REQUIRED_ROWS:
            raise PlottingConfigurationError(node_id, f"Not enough valid data in '{target_col}' for a distribution.")

        raw_data = plot_df[target_col].to_list()
        counts, bin_edges = np.histogram(raw_data, bins=20)
        bin_labels = [f"{round(bin_edges[i], 1)} - {round(bin_edges[i+1], 1)}" for i in range(len(counts))]

        return {
            "chart_type": "histogram",
            "title": f"Distribution of {target_col}",
            "echarts_payload": {
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": bin_labels, "name": f"{target_col} Ranges", "axisLabel": {"rotate": 45}},
                "yAxis": {"type": "value", "name": "Frequency"},
                "series": [{"type": "bar", "data": counts.tolist(), "barWidth": "99%"}]
            }
        }

    def _build_boxplot(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        target_col = self._extract_column(parameters, df, ["target_col", "y_col", "column_name", "column"])
        
        if not target_col:
             raise PlottingConfigurationError(node_id, f"Boxplots require a valid target column. AI provided: {parameters}")

        plot_df = df.drop_nulls(subset=[target_col])
        if plot_df.height < 5:
            raise PlottingConfigurationError(node_id, f"Not enough data in '{target_col}' for a boxplot.")

        data = plot_df[target_col].to_numpy()
        quartiles = np.percentile(data, [0, 25, 50, 75, 100]).tolist()

        return {
            "chart_type": "boxplot",
            "title": f"Outlier Analysis: {target_col}",
            "echarts_payload": {
                "tooltip": {"trigger": "item"},
                "xAxis": {"type": "category", "data": [target_col]},
                "yAxis": {"type": "value"},
                "series": [{"type": "boxplot", "data": [quartiles]}]
            }
        }

    def _build_heatmap(self, node_id: str, df: pl.DataFrame) -> Dict[str, Any]:
        # Grab only numeric columns and drop nulls
        numeric_df = df.select(cs.numeric()).drop_nulls()
        cols = numeric_df.columns
        
        if len(cols) < 2:
            raise PlottingConfigurationError(node_id, "Need at least 2 numeric columns for a correlation heatmap.")

        corr_matrix = numeric_df.corr()
        
        heatmap_data = []
        for i, row_col in enumerate(cols):
            for j, col_name in enumerate(cols):
                val = round(corr_matrix[row_col][j], 2)
                heatmap_data.append([j, i, val]) # [X, Y, Value]

        return {
            "chart_type": "heatmap",
            "title": "Feature Correlation Matrix",
            "echarts_payload": {
                "tooltip": {"position": "top"},
                "xAxis": {"type": "category", "data": cols, "axisLabel": {"rotate": 45}},
                "yAxis": {"type": "category", "data": cols},
                "visualMap": {
                    "min": -1, "max": 1, "calculable": True, "orient": "horizontal", 
                    "left": "center", "bottom": "0%",
                    "inRange": {"color": ["#d73027", "#ffffbf", "#1a9850"]}
                },
                "series": [{
                    "name": "Pearson Correlation",
                    "type": "heatmap",
                    "data": heatmap_data,
                    "label": {"show": True}
                }]
            }
        }