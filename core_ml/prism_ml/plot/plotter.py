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
        x_col = parameters.get("x_col")
        y_col = parameters.get("y_col")

        if not x_col or not y_col:
            raise PlottingConfigurationError(node_id, "Scatter plots require 'x_col' and 'y_col'.")
        if x_col not in df.columns or y_col not in df.columns:
            raise PlottingConfigurationError(node_id, f"Columns '{x_col}' or '{y_col}' not found.")

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
        category_col = parameters.get("category_col")
        
        if not category_col or category_col not in df.columns:
             raise PlottingConfigurationError(node_id, "Bar charts require a valid 'category_col'.")

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
        target_col = parameters.get("target_col")
        if not target_col or target_col not in df.columns:
             raise PlottingConfigurationError(node_id, "Histograms require a valid 'target_col'.")

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
        target_col = parameters.get("target_col")
        if not target_col or target_col not in df.columns:
             raise PlottingConfigurationError(node_id, "Boxplots require a 'target_col'.")

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