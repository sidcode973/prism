# ==========================================
# CUSTOM PRISM EXCEPTIONS
# ==========================================

class PrismCoreError(Exception):
    """Base exception for all errors within the Prism ML Core."""
    pass

class DataLoadError(PrismCoreError):
    """Raised when the requested dataset cannot be found or read."""
    def __init__(self, file_path: str, message: str = "Failed to load data."):
        self.file_path = file_path
        self.message = f"{message} Path: {file_path}"
        super().__init__(self.message)

class CleaningConfigurationError(PrismCoreError):
    """Raised when the JSON contract provides invalid cleaning instructions."""
    def __init__(self, node_id: str, message: str):
        self.node_id = node_id
        self.message = f"Config Error in Node '{node_id}': {message}"
        super().__init__(self.message)
class TrainingConfigurationError(PrismCoreError):
    """Raised when the training configuration is missing critical data (like a target column)."""
    def __init__(self, node_id: str, message: str):
        self.node_id = node_id
        self.message = f"Training Error in Node '{node_id}': {message}"
        super().__init__(self.message)