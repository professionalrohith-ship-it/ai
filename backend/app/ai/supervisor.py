"""Supervisor: picks the agent for a request and runs it through a small LangGraph graph
(route -> one agent node -> finalize). Routing is rule based so it is fast, free and testable."""
from __future__ import annotations

import re
from typing import Any, Callable, TypedDict

from langgraph.graph import END, StateGraph

from .agents import AGENTS, SUPERVISOR_ID
from .stacktrace import parse_frames

_PATTERNS: dict[str, list[tuple[re.Pattern, int]]] = {
    "bug-investigator": [
        (re.compile(r"traceback|stack ?trace", re.I), 5),
        (re.compile(r"\b(bug|crash(?:es|ed|ing)?|broken|not working|doesn'?t work|fails?|failing|failed|segfault|panic)\b", re.I), 2),
        (re.compile(r"\b\w+(?:Error|Exception)\b"), 2),
        (re.compile(r"\b(error|exception|undefined|null pointer)\b", re.I), 1),
    ],
    "dependency-analyst": [
        (re.compile(r"\b(imports?|imported|dependenc\w*|packages?|librar(?:y|ies)|requirements|npm|pip|circular|third[- ]party|external)\b", re.I), 2),
        (re.compile(r"\bwho (?:uses|imports)\b|\bused by\b|\bdepends on\b", re.I), 2),
    ],
    "architecture-analyst": [
        (re.compile(r"\barchitecture\b", re.I), 3),
        (re.compile(r"\b(components?|layers?|design|modules?|data flow|overall structure|fit together)\b", re.I), 2),
        (re.compile(r"\bhow (?:\w+ ){0,4}(?:connected|related|interact\w*)\b", re.I), 2),
    ],
    "documentation": [
        (re.compile(r"\b(document(?:ation)?|docs|readme|api reference|changelog)\b", re.I), 3),
        (re.compile(r"\b(?:generate|write|create)\b.*\b(?:docs?|documentation|readme)\b", re.I), 3),
    ],
    "repository-explorer": [
        (re.compile(r"\b(overview|what is this|repository structure|project structure|folders?|directories|directory|"
                    r"entry points?|main files?|important files|where (?:do|should) i start|tech stack|languages?)\b", re.I), 2),
        (re.compile(r"what does this (?:repo|repository|project|app) do", re.I), 3),
    ],
    "code-intelligence": [
        (re.compile(r"\b(function|class|method|symbol|defined|definition|signature|parameters?|arguments?|returns?|"
                    r"implement(?:s|ed|ation)?|where is)\b", re.I), 2),
        (re.compile(r"\bwhat does \S+ do\b|\bhow does \S+ work\b", re.I), 2),
    ],
}
#: wins ties
PRIORITY = ["bug-investigator", "documentation", "dependency-analyst", "architecture-analyst", "code-intelligence", "repository-explorer"]


def route_request(question: str, forced: str | None = None, previous_agent: str | None = None,
                  symbol_mention: bool = False) -> tuple[str, str]:
    """(agent id, human-readable reason)."""
    if forced:
        return forced, f"You asked for the {AGENTS[forced].name}."
    scores = {agent: sum(w for rx, w in rules if rx.search(question)) for agent, rules in _PATTERNS.items()}
    if len(parse_frames(question)) >= 1:
        scores["bug-investigator"] += 5
    if symbol_mention:
        scores["code-intelligence"] += 3
    best = max(PRIORITY, key=lambda a: (scores[a], -PRIORITY.index(a)))
    if scores[best] > 0:
        reason = {
            "bug-investigator": "The request describes an error or contains a stack trace.",
            "documentation": "The request asks for documentation.",
            "dependency-analyst": "The request is about imports or dependencies.",
            "architecture-analyst": "The request is about the application architecture.",
            "code-intelligence": "The request is about specific code" + (" (it names a symbol in the repository)." if symbol_mention else "."),
            "repository-explorer": "The request is about the repository structure.",
        }[best]
        return best, reason
    if previous_agent in AGENTS and len(question.split()) <= 8:
        return previous_agent, "Short follow-up: kept the agent from the previous answer."
    if symbol_mention:
        return "code-intelligence", "The request names a symbol in the repository."
    return "repository-explorer", "No specific topic detected: starting with the repository overview."


class _State(TypedDict, total=False):
    question: str
    forced: str | None
    previous_agent: str | None
    symbol_mention: bool
    runner: Any
    agent: str
    route_reason: str
    result: dict


class Supervisor:
    """Compiled once. `runner(agent_id, question)` does the real work for the chosen agent."""

    def __init__(self) -> None:
        graph = StateGraph(_State)
        graph.add_node("route", self._route)
        graph.add_node("finalize", self._finalize)
        for agent_id in AGENTS:
            graph.add_node(agent_id, self._agent_node(agent_id))
            graph.add_edge(agent_id, "finalize")
        graph.set_entry_point("route")
        graph.add_conditional_edges("route", lambda state: state["agent"], {agent_id: agent_id for agent_id in AGENTS})
        graph.add_edge("finalize", END)
        self.graph = graph.compile()

    @staticmethod
    def _route(state: _State) -> dict:
        agent, reason = route_request(state["question"], state.get("forced"), state.get("previous_agent"),
                                      state.get("symbol_mention", False))
        return {"agent": agent, "route_reason": reason}

    @staticmethod
    def _agent_node(agent_id: str) -> Callable[[_State], dict]:
        def node(state: _State) -> dict:
            return {"result": state["runner"](agent_id, state["question"])}
        return node

    @staticmethod
    def _finalize(state: _State) -> dict:
        result = dict(state["result"])
        agent = state["agent"]
        result["agent"] = agent
        result["routeReason"] = state["route_reason"]
        result["steps"] = [{"agentId": SUPERVISOR_ID, "label": f"Understood the request and selected the {AGENTS[agent].name}"},
                           *result.get("steps", [])]
        return {"result": result}

    def run(self, question: str, runner: Callable[[str, str], dict], forced: str | None = None,
            previous_agent: str | None = None, symbol_mention: bool = False) -> dict:
        state = self.graph.invoke({"question": question, "forced": forced, "previous_agent": previous_agent,
                                   "symbol_mention": symbol_mention, "runner": runner})
        return state["result"]
