import os
import s3fs
import tempfile
from fpdf import FPDF
from datetime import datetime

class PrismPDF(FPDF):
    def header(self):
        # Premium Enterprise Header
        self.set_font("helvetica", "B", 24)
        self.set_text_color(17, 24, 39)
        self.cell(0, 12, "PRISM MLOps", border=False, ln=1, align="L")
        
        self.set_font("helvetica", "", 12)
        self.set_text_color(107, 114, 128)
        self.cell(0, 6, "AUTOMATED PIPELINE AUDIT REPORT", border=False, ln=1, align="L")
        
        # Neo-brutalist yellow accent line
        self.set_fill_color(253, 224, 71) 
        self.cell(0, 3, "", border=False, ln=1, fill=True)
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "I", 8)
        self.set_text_color(156, 163, 175)
        self.cell(0, 10, f"Page {self.page_no()} | Generated securely by Prism Engine", align="C")

class PrismReporter:
    def __init__(self):
        self.s3_endpoint = os.getenv("MINIO_ENDPOINT_URL", "http://127.0.0.1:9000")
        self.s3_key = os.getenv("MINIO_ACCESS_KEY", "prismadmin")
        self.s3_secret = os.getenv("MINIO_SECRET_KEY", "prismpassword")
        
    def _get_filesystem(self) -> s3fs.S3FileSystem:
        return s3fs.S3FileSystem(
            client_kwargs={'endpoint_url': self.s3_endpoint},
            key=self.s3_key,
            secret=self.s3_secret
        )

    def generate_report(self, master_blueprint: dict, raw_data_path: str, run_id: str) -> str:
        print("📄 Initializing Premium PDF Engine...")
        fs = self._get_filesystem()
        pdf = PrismPDF()
        pdf.add_page()
        
        # Helper for section titles
        def section_title(title: str):
            pdf.set_font("helvetica", "B", 14)
            pdf.set_text_color(17, 24, 39)
            pdf.cell(0, 10, title, ln=1)
            pdf.ln(2)

        # Helper for Key-Value pairs
        def key_val_row(key: str, val: str):
            pdf.set_font("helvetica", "B", 10)
            pdf.set_text_color(75, 85, 99)
            pdf.cell(50, 8, f"{key}:", border=0)
            pdf.set_font("helvetica", "", 10)
            pdf.set_text_color(17, 24, 39)
            pdf.cell(0, 8, str(val), border=0, ln=1)

        # ==========================================
        # 1. RUN METADATA & PIPELINE TRACE
        # ==========================================
        section_title("1. Execution Metadata")
        key_val_row("Run ID", run_id)
        key_val_row("Timestamp", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        key_val_row("Source Dataset", raw_data_path.split('/')[-1])
        nodes = master_blueprint.get("nodes_executed", [])
        key_val_row("Execution Sequence", " -> ".join(nodes))
        pdf.ln(8)

        # ==========================================
        # 2. MODEL SELECTION & PERFORMANCE
        # ==========================================
        meta = master_blueprint.get("__training_metadata__", {})
        if meta:
            section_title("2. Model Evaluation")
            key_val_row("Task Type", str(meta.get('task')).upper())
            key_val_row("Target Feature", meta.get('target_column', 'N/A'))
            key_val_row("Champion Algorithm", str(meta.get('best_estimator', 'N/A')).upper())
            key_val_row("Validation Strategy", str(meta.get('evaluation_mode')).replace("_", " ").title())
            
            metric = str(meta.get('metric')).upper()
            score = float(meta.get('final_score', 0))
            
            # Highlighted Score Block (Light Purple)
            pdf.ln(2)
            pdf.set_font("helvetica", "B", 11)
            pdf.set_fill_color(243, 232, 255) # Purple-100
            pdf.set_text_color(107, 33, 168)  # Purple-800
            pdf.cell(60, 12, f"  Final {metric} Score:", border=0, fill=True)
            pdf.cell(0, 12, f"{score:.4f}", border=0, fill=True, ln=1)
            pdf.ln(10)
            pdf.set_text_color(17, 24, 39) # Reset text color

        # ==========================================
        # 3. FEATURE ENGINEERING MAPS (STYLED TABLES)
        # ==========================================
        imputs = master_blueprint.get("__imputations__", {})
        ohe = master_blueprint.get("__ohe_mappings__", {})
        
        pdf.set_draw_color(209, 213, 219) # Soft gray borders
        
        if imputs or ohe:
            section_title("3. Data Imputation & Encoding Schema")
            
            if imputs:
                pdf.set_font("helvetica", "B", 11)
                pdf.cell(0, 8, "Missing Value Imputations", ln=1)
                
                # Table Header
                pdf.set_font("helvetica", "B", 10)
                pdf.set_fill_color(229, 231, 235) # Gray-200
                pdf.cell(60, 10, "  Feature", border=1, fill=True)
                pdf.cell(130, 10, "  Fallback Value Applied", border=1, fill=True, ln=1)
                
                # Table Body (Zebra Striping)
                pdf.set_font("helvetica", "", 10)
                fill = False
                for col, rule in imputs.items():
                    pdf.set_fill_color(249, 250, 251) # Gray-50
                    
                    # 🚀 FIX: The "None" String Bug
                    method_str = rule.get('strategy')
                    method_name = str(method_str).title() if method_str and str(method_str).lower() != "none" else "Auto-Calculated"
                    
                    pdf.cell(60, 10, f"  {col}", border=1, fill=fill)
                    pdf.cell(130, 10, f"  {method_name} ({rule.get('fill_value')})", border=1, fill=fill, ln=1)
                    fill = not fill # Toggle stripe
                pdf.ln(8)
            
            if ohe:
                pdf.set_font("helvetica", "B", 11)
                pdf.cell(0, 8, "One-Hot Encoded Variables", ln=1)
                
                # Table Header
                pdf.set_font("helvetica", "B", 10)
                pdf.set_fill_color(229, 231, 235) # Gray-200
                pdf.cell(60, 10, "  Original Feature", border=1, fill=True)
                pdf.cell(130, 10, "  Extracted Categories", border=1, fill=True, ln=1)
                
                # Table Body (Zebra Striping)
                pdf.set_font("helvetica", "", 10)
                fill = False
                for col, cats in ohe.items():
                    pdf.set_fill_color(249, 250, 251) # Gray-50
                    pdf.cell(60, 10, f"  {col}", border=1, fill=fill)
                    cat_str = ", ".join([str(c) for c in cats])
                    pdf.cell(130, 10, f"  {cat_str}", border=1, fill=fill, ln=1)
                    fill = not fill # Toggle stripe
            pdf.ln(10)

        # ==========================================
        # 4. SHAP EXPLAINABILITY
        # ==========================================
        shap_path = meta.get("shap_plot_path")
        if shap_path and fs.exists(shap_path):
            pdf.add_page()
            section_title("4. SHAP Feature Importance")
            pdf.set_font("helvetica", "", 10)
            pdf.cell(0, 6, "The plot below illustrates the Shapley Additive exPlanations (SHAP) impact matrix.", ln=1)
            pdf.cell(0, 6, "Features at the top have the highest driving impact on the model's final predictions.", ln=1)
            pdf.ln(5)
            
            # Safely extract image from cloud to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                with fs.open(shap_path, 'rb') as f_in:
                    tmp.write(f_in.read())
                tmp_img_path = tmp.name
            
            # Embed image with proper margins
            pdf.image(tmp_img_path, x=15, w=180)
            os.remove(tmp_img_path)

        # ==========================================
        # SAVE & EXPORT
        # ==========================================
        directory = "/".join(raw_data_path.split("/")[:-1])
        s3_pdf_path = f"{directory}/prism_audit_report_{run_id}.pdf"
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            pdf.output(tmp.name)
            with fs.open(s3_pdf_path, 'wb') as f_out:
                with open(tmp.name, 'rb') as f_in:
                    f_out.write(f_in.read())
            os.remove(tmp.name)
            
        return s3_pdf_path