"""
AI Service — сервисный слой над AIEngine.
Удобная точка входа для API, WebSocket и других частей системы.
"""

from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

try:
    from ai import AIEngine
except ImportError:
    from ai.engine import AIEngine


class AIService:
    """
    Сервисный фасад для ИИ.
    Держит один экземпляр движка и даёт чистые методы.
    """

    def __init__(self, config: Optional[Dict] = None):
        self.engine = AIEngine(config or {})
        self._last_plan: Optional[Dict] = None

    def build_plan(
        self,
        tasks: List[Dict],
        brigades: List[Dict],
        resources: Optional[List[Dict]] = None,
        horizon: str = "month",
        start_date: Optional[str] = None,
        do_leveling: bool = True,
        constraints: Optional[Dict] = None
    ) -> Dict[str, Any]:
        plan = self.engine.build_plan(
            tasks=tasks,
            resources=resources or [],
            brigades=brigades,
            horizon=horizon,
            start_date=start_date,
            constraints=constraints,
            do_leveling=do_leveling
        )
        self._last_plan = plan
        return plan

    def detect_and_replan(
        self,
        current_plan: Dict,
        actual_data: Dict,
        brigades: List[Dict],
        resources: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        result = self.engine.detect_and_replan(
            current_plan=current_plan,
            actual_data=actual_data,
            resources=resources or [],
            brigades=brigades
        )
        if result.get("new_plan"):
            self._last_plan = result["new_plan"]
        return result

    def get_recommendations(self, plan: Optional[Dict] = None) -> List[Dict]:
        return self.engine.get_recommendations(plan or self._last_plan)

    def get_status(self) -> Dict[str, Any]:
        return self.engine.get_status()

    def explain(self, decision_id: Optional[str] = None) -> Dict:
        return self.engine.explain_decision(decision_id)

    @property
    def last_plan(self) -> Optional[Dict]:
        return self._last_plan or self.engine.last_plan


# Глобальный экземпляр (можно заменить на DI)
ai_service = AIService()