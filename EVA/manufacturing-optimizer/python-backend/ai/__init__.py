"""
AI-пакет системы планирования НЭВЗ.

Основные возможности:
- Построение планов (год / полгода / месяц)
- Распределение бригад и ресурсов
- Critical Path Method + Resource Leveling
- Обнаружение сбоев и перестроение плана с минимальными изменениями
- Поиск узких мест
"""

from .engine import AIEngine
from .scheduler import Scheduler
from .optimizer import Optimizer
from .anomaly_detector import AnomalyDetector, detect_anomalies
from .bottleneck_analyzer import BottleneckAnalyzer, find_bottlenecks

# Опциональные модули
try:
    from .predictor import Predictor
except ImportError:
    Predictor = None

self.gap_detector = GapDetector()
self.gap_bridger = GapBridger()

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
