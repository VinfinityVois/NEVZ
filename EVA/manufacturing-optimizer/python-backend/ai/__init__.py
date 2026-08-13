"""
AI-пакет системы планирования НЭВЗ.
...
"""

from .engine import AIEngine
from .scheduler import Scheduler
from .optimizer import Optimizer
from .anomaly_detector import AnomalyDetector, detect_anomalies
from .bottleneck_analyzer import BottleneckAnalyzer, find_bottlenecks

try:
    from .predictor import Predictor
except ImportError:
    Predictor = None

__all__ = [
    "AIEngine",
    "Scheduler",
    "Optimizer",
    "AnomalyDetector",
    "detect_anomalies",
    "BottleneckAnalyzer",
    "find_bottlenecks",
    "Predictor",
]

__version__ = "0.1.0"