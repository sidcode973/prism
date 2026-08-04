import polars as pl
import numpy as np
import pandas as pd
import polars.selectors as cs
from typing import Dict, Any
from prism_ml.exceptions import PlottingConfigurationError

class PrismPlotter:
    def __init__(self):
        print("📊 Prism Plotter Initialized")
        # ECharts Canvas handles ~15k-20k points smoothly
        self.MAX_SAFE_ROWS = 15000 
        # Minimum points needed to construct a meaningful chart
        self.MIN_REQUIRED_ROWS = 2 

    def _extract_column(self, parameters: Dict[str, Any], df: pl.DataFrame, known_keys: list) -> str:
        """
        1. Tries to find column name using provided parameter key list.
        2. Falls back to scanning all parameter string values for a matching column name in df.
        """
        for key in known_keys:
            val = parameters.get(key)
            if val and isinstance(val, str) and val in df.columns:
                return val
        
        for key, val in parameters.items():
            if isinstance(val, str) and val in df.columns:
                print(f"🕵️‍♂️ AI/Manual Scanner found valid column '{val}' hiding inside key '{key}'!")
                return val
                
        return None

    def generate_plot(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        chart_type = parameters.get("chart_type")
        if not chart_type:
            raise PlottingConfigurationError(node_id, "Missing 'chart_type' in parameters.")

        chart_type = chart_type.lower().strip()
        print(f"📈 Generating '{chart_type}' plot for node {node_id}...")

        if chart_type in ["scatter", "scatterplot"]:
            return self._build_scatter(node_id, df, parameters)
        elif chart_type in ["bar", "barchart"]:
            return self._build_bar(node_id, df, parameters)
        elif chart_type in ["histogram", "dist"]:
            return self._build_histogram(node_id, df, parameters)
        elif chart_type in ["boxplot", "box"]:
            return self._build_boxplot(node_id, df, parameters)
        elif chart_type in ["heatmap", "correlation"]:
            return self._build_heatmap(node_id, df, parameters)
        else:
            raise PlottingConfigurationError(node_id, f"Unsupported chart type: '{chart_type}'")

    # ==========================================
    # CHART BUILDERS
    # ==========================================

    def _build_scatter(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        x_col = self._extract_column(parameters, df, ["x_column", "x_col", "x", "x_axis"])
        y_col = self._extract_column(parameters, df, ["y_column", "y_col", "y", "y_axis"])
        color_col = self._extract_column(parameters, df, ["color_column", "color_col", "color", "group_by", "hue"])

        if not x_col or not y_col:
            valid_cols = [v for v in parameters.values() if isinstance(v, str) and v in df.columns]
            if not x_col and len(valid_cols) > 0: x_col = valid_cols[0]
            if not y_col and len(valid_cols) > 1: y_col = valid_cols[1]

        if not x_col or not y_col:
            raise PlottingConfigurationError(node_id, f"Scatter plots require 2 valid columns. Received: {parameters}")

        subset_cols = [x_col, y_col]
        if color_col: subset_cols.append(color_col)
        
        plot_df = df.drop_nulls(subset=subset_cols)
        if plot_df.height < self.MIN_REQUIRED_ROWS:
            raise PlottingConfigurationError(node_id, f"Not enough valid data to plot {x_col} vs {y_col}.")

        if plot_df.height > self.MAX_SAFE_ROWS:
            print(f"⚠️ Downsampling {plot_df.height} rows to {self.MAX_SAFE_ROWS} for UI performance.")
            plot_df = plot_df.sample(n=self.MAX_SAFE_ROWS, seed=42)

        marker_size = parameters.get("marker_size", 10)
        pdf = plot_df.to_pandas()
        
        series = []
        if color_col:
            groups = pdf.groupby(color_col)
            for name, group in groups:
                data = group[[x_col, y_col]].values.tolist()
                series.append({"name": str(name), "type": "scatter", "data": data, "symbolSize": marker_size})
            legend = {"show": True}
        else:
            data_points = pdf[[x_col, y_col]].values.tolist()
            series = [{"type": "scatter", "data": data_points, "symbolSize": marker_size}]
            legend = {"show": False}

        title = parameters.get("title") or f"{y_col} vs {x_col}"
        x_name = parameters.get("x_label") or parameters.get("x_axis_label") or x_col
        y_name = parameters.get("y_label") or parameters.get("y_axis_label") or y_col

        return {
            "chart_type": "scatter",
            "title": title,
            "echarts_payload": {
                "title": {"text": title, "left": "center"},
                "toolbox": {"feature": {"saveAsImage": {"title": "Download", "name": "scatter_plot"}}},
                "tooltip": {"trigger": "item"},
                "legend": legend,
                "xAxis": {"type": "value", "name": x_name, "nameLocation": "middle", "nameGap": 30},
                "yAxis": {"type": "value", "name": y_name},
                "series": series
            }
        }

    def _build_bar(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        category_col = self._extract_column(parameters, df, ["category_column", "category_col", "x_column", "x_col", "category"])
        y_col = self._extract_column(parameters, df, ["y_column", "y_col", "y", "target"])
        color_col = self._extract_column(parameters, df, ["color_column", "color_col", "color", "group_by", "hue"])
        
        if not category_col:
            raise PlottingConfigurationError(node_id, f"Bar charts require a valid category column. Received: {parameters}")

        subset_cols = [category_col]
        if y_col: subset_cols.append(y_col)
        if color_col: subset_cols.append(color_col)
        
        plot_df = df.drop_nulls(subset=subset_cols)
        if plot_df.height == 0:
            raise PlottingConfigurationError(node_id, f"No valid data found in '{category_col}'.")

        pdf = plot_df.to_pandas()
        
        if color_col and y_col:
            grouped = pdf.groupby([category_col, color_col])[y_col].mean().unstack().fillna(0)
            categories = grouped.index.tolist()
            series = [{"name": str(col), "type": "bar", "data": grouped[col].tolist()} for col in grouped.columns]
            legend = {"show": True}
        elif color_col and not y_col:
            grouped = pdf.groupby([category_col, color_col]).size().unstack().fillna(0)
            categories = grouped.index.tolist()
            series = [{"name": str(col), "type": "bar", "data": grouped[col].tolist()} for col in grouped.columns]
            legend = {"show": True}
        else:
            if y_col:
                value_counts = plot_df.group_by(category_col).mean()
                y_series = value_counts.get_column(y_col).to_list()
            else:
                value_counts = plot_df.group_by(category_col).count().sort("count", descending=True)
                y_series = value_counts.get_column("count").to_list()
                
            if value_counts.height > 30: value_counts = value_counts.head(30)
            categories = [str(x) for x in value_counts.get_column(category_col).to_list()]
            series = [{"type": "bar", "data": y_series}]
            legend = {"show": False}

        title = parameters.get("title") or f"Analysis of {category_col}"
        x_name = parameters.get("x_label") or parameters.get("x_axis_label") or category_col
        y_name = parameters.get("y_label") or parameters.get("y_axis_label") or (y_col if y_col else "Count")

        return {
            "chart_type": "bar",
            "title": title,
            "echarts_payload": {
                "title": {"text": title, "left": "center"},
                "toolbox": {"feature": {"saveAsImage": {"title": "Download", "name": "bar_chart"}}},
                "tooltip": {"trigger": "axis"},
                "legend": legend,
                "xAxis": {"type": "category", "data": categories, "name": x_name, "axisLabel": {"rotate": 45, "interval": 0}},
                "yAxis": {"type": "value", "name": y_name},
                "series": series
            }
        }

    def _build_histogram(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        target_col = self._extract_column(parameters, df, ["target_column", "target_col", "x_column", "x_col", "column"])
        
        if not target_col:
            raise PlottingConfigurationError(node_id, f"Histograms require a valid target column. Received: {parameters}")

        plot_df = df.drop_nulls(subset=[target_col])
        if plot_df.height < self.MIN_REQUIRED_ROWS:
            raise PlottingConfigurationError(node_id, f"Not enough valid data in '{target_col}' for a distribution.")

        try:
            nbins = int(parameters.get("nbins") or parameters.get("bins") or 20)
        except (ValueError, TypeError):
            nbins = 20

        raw_data = plot_df[target_col].to_numpy()
        counts, bin_edges = np.histogram(raw_data, bins=nbins)
        bin_labels = [f"{round(bin_edges[i], 2)} - {round(bin_edges[i+1], 2)}" for i in range(len(counts))]

        title = parameters.get("title") or f"Distribution of {target_col}"
        x_name = parameters.get("x_label") or parameters.get("x_axis_label") or f"{target_col} Ranges"
        y_name = parameters.get("y_label") or parameters.get("y_axis_label") or "Frequency"
        color = parameters.get("color") or "#5470c6"

        return {
            "chart_type": "histogram",
            "title": title,
            "echarts_payload": {
                "title": {"text": title, "left": "center"},
                "toolbox": {"feature": {"saveAsImage": {"title": "Download", "name": "histogram"}}},
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": bin_labels, "name": x_name, "axisLabel": {"rotate": 45}},
                "yAxis": {"type": "value", "name": y_name},
                "series": [{"type": "bar", "data": counts.tolist(), "barWidth": "99%", "itemStyle": {"color": color}}]
            }
        }

    def _build_boxplot(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        target_col = self._extract_column(parameters, df, ["target_column", "target_col", "y_column", "y_col", "column"])
        color_col = self._extract_column(parameters, df, ["color_column", "color_col", "color", "group_by", "x_column", "x_col"])
        
        if not target_col:
            raise PlottingConfigurationError(node_id, f"Boxplots require a valid target column. Received: {parameters}")

        subset_cols = [target_col]
        if color_col: subset_cols.append(color_col)
            
        plot_df = df.drop_nulls(subset=subset_cols)
        if plot_df.height < 5:
            raise PlottingConfigurationError(node_id, f"Not enough data in '{target_col}' for a boxplot.")

        box_data = []
        categories = []
        pdf = plot_df.to_pandas()
        
        if color_col:
            groups = pdf.groupby(color_col)[target_col].apply(list).to_dict()
            categories = list(groups.keys())
            for cat in categories:
                vals = pd.Series(groups[cat]).dropna()
                if len(vals) > 0:
                    q1, med, q3 = np.percentile(vals, [25, 50, 75])
                    iqr = q3 - q1
                    box_data.append([max(vals.min(), q1 - 1.5 * iqr), q1, med, q3, min(vals.max(), q3 + 1.5 * iqr)])
                else:
                    box_data.append([])
        else:
            categories = [target_col]
            vals = pdf[target_col].dropna()
            if len(vals) > 0:
                q1, med, q3 = np.percentile(vals, [25, 50, 75])
                iqr = q3 - q1
                box_data = [[max(vals.min(), q1 - 1.5 * iqr), q1, med, q3, min(vals.max(), q3 + 1.5 * iqr)]]

        title = parameters.get("title") or f"Outlier Analysis: {target_col}"
        x_name = parameters.get("x_label") or parameters.get("x_axis_label") or (color_col if color_col else "")
        y_name = parameters.get("y_label") or parameters.get("y_axis_label") or "Values"

        return {
            "chart_type": "boxplot",
            "title": title,
            "echarts_payload": {
                "title": {"text": title, "left": "center"},
                "toolbox": {"feature": {"saveAsImage": {"title": "Download", "name": "boxplot"}}},
                "tooltip": {"trigger": "item", "axisPointer": {"type": "shadow"}},
                "xAxis": {"type": "category", "data": [str(c) for c in categories], "name": x_name},
                "yAxis": {"type": "value", "name": y_name},
                "series": [{"name": "Boxplot", "type": "boxplot", "data": box_data}]
            }
        }

    def _build_heatmap(self, node_id: str, df: pl.DataFrame, parameters: Dict[str, Any]) -> Dict[str, Any]:
        numeric_df = df.select(cs.numeric()).drop_nulls()
        cols = numeric_df.columns
        
        if len(cols) < 2:
            raise PlottingConfigurationError(node_id, "Need at least 2 numeric columns for a correlation heatmap.")

        corr_matrix = numeric_df.corr()
        
        heatmap_data = []
        for i, row_col in enumerate(cols):
            for j, col_name in enumerate(cols):
                val = round(float(corr_matrix[row_col][j]), 2)
                heatmap_data.append([j, i, val])

        title = parameters.get("title") or "Feature Correlation Matrix"

        return {
            "chart_type": "heatmap",
            "title": title,
            "echarts_payload": {
                "title": {"text": title, "left": "center"},
                "toolbox": {"feature": {"saveAsImage": {"title": "Download", "name": "heatmap"}}},
                "tooltip": {"position": "top"},
                "animation": False,
                "grid": {"height": "50%", "top": "10%"},
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
                    "label": {"show": True},
                    "emphasis": {"itemStyle": {"shadowBlur": 10, "shadowColor": "rgba(0, 0, 0, 0.5)"}}
                }]
            }
        }