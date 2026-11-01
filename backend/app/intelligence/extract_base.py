"""Shared machinery for the per-language extractors: context, iterative tree walk, comment helpers."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable

from tree_sitter import Node

from .model import ImportRef, ParseResult, Relation, Symbol

MAX_SYMBOLS = 20_000
MAX_CALLS = 1_500
DOC_MAX = 600
_WS = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class Scope:
    qname: str  # name relative to the file ("" at module level), e.g. "Outer.Inner.method"
    kind: str  # module | class | function | namespace

    @property
    def parent(self) -> str | None:
        return self.qname or None


MODULE = Scope("", "module")


def collapse(text: str, limit: int = 200) -> str:
    text = _WS.sub(" ", text).strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


class Ctx:
    def __init__(self, language: str, src: bytes):
        self.language = language
        self.src = src
        self.result = ParseResult(language=language)
        self.export_names: set[str] = set()
        self.namespace = ""
        self._calls: set[tuple[str, str]] = set()

    # ---- text helpers ------------------------------------------------------------------
    def text(self, node: Node | None) -> str:
        return self.src[node.start_byte : node.end_byte].decode("utf-8", "replace") if node else ""

    def field(self, node: Node, name: str) -> str:
        return self.text(node.child_by_field_name(name))

    # ---- collectors --------------------------------------------------------------------
    def add_symbol(self, name: str, kind: str, node: Node, scope: Scope, **extra) -> Symbol | None:
        if not name or len(self.result.symbols) >= MAX_SYMBOLS:
            self.result.truncated = self.result.truncated or len(self.result.symbols) >= MAX_SYMBOLS
            return None
        relative = f"{scope.qname}.{name}" if scope.qname else name
        qualified = f"{self.namespace}.{relative}" if self.namespace else relative
        symbol = Symbol(
            name=name, kind=kind, qualified_name=qualified, parent=scope.parent,
            start_line=node.start_point[0] + 1, end_line=node.end_point[0] + 1, language=self.language, **extra,
        )
        self.result.symbols.append(symbol)
        return symbol

    def child_scope(self, scope: Scope, name: str, kind: str) -> Scope:
        return Scope(f"{scope.qname}.{name}" if scope.qname else name, kind)

    def add_import(self, node: Node, module: str, kind: str, names: list[str] | None = None,
                   alias: str | None = None, level: int = 0) -> None:
        if module or names:
            self.result.imports.append(
                ImportRef(module=module, kind=kind, line=node.start_point[0] + 1, names=names or [], alias=alias, level=level)
            )

    def add_call(self, scope: Scope, target: str | None, node: Node) -> None:
        if not target or len(target) > 120:
            return
        key = (scope.qname, target)
        if key in self._calls or len(self._calls) >= MAX_CALLS:
            return
        self._calls.add(key)
        self.result.relations.append(Relation(scope.qname, "calls", target, node.start_point[0] + 1))

    def add_relation(self, source: str, relation: str, target: str, node: Node) -> None:
        self.result.relations.append(Relation(source, relation, target, node.start_point[0] + 1))


Handler = Callable[[Ctx, Node, Scope], "Scope | None"]


def walk(ctx: Ctx, root: Node, handlers: dict[str, Handler]) -> None:
    """Document-order walk with an explicit stack (no recursion limit on deeply nested sources).
    A handler may return a Scope that applies to the node's children."""
    stack: list[tuple[Node, Scope]] = [(root, MODULE)]
    while stack:
        node, scope = stack.pop()
        child_scope = scope
        handler = handlers.get(node.type)
        if handler:
            returned = handler(ctx, node, scope)
            if returned is not None:
                child_scope = returned
        for child in reversed(node.children):
            stack.append((child, child_scope))


def count_syntax_errors(root: Node, limit: int = 10_000) -> tuple[int, int | None]:
    """(number of ERROR/MISSING nodes, line of the first one). Only walks when the tree has errors."""
    if not root.has_error:
        return 0, None
    count, first = 0, None
    stack = [root]
    while stack and count < limit:
        node = stack.pop()
        if node.type == "ERROR" or node.is_missing:
            count += 1
            line = node.start_point[0] + 1
            first = line if first is None else min(first, line)
        if node.has_error or node.is_missing:
            stack.extend(node.children)
    return max(count, 1), first


# ---- comments ----------------------------------------------------------------------------------
_BLOCK_EDGES = re.compile(r"^\s*/\*+!?\s?|\s*\*+/\s*$")
_LINE_PREFIX = re.compile(r"^\s*(///?!?|#+|\*)\s?")


def clean_comment(raw: str) -> str:
    lines = []
    for line in raw.strip().splitlines():
        line = _BLOCK_EDGES.sub("", line)
        line = _LINE_PREFIX.sub("", line)
        lines.append(line.strip())
    text = "\n".join(lines).strip()
    return text if len(text) <= DOC_MAX else text[: DOC_MAX - 1] + "…"


def leading_comment(ctx: Ctx, node: Node, comment_types: tuple[str, ...] = ("comment",),
                    skip_types: tuple[str, ...] = ()) -> str | None:
    """Doc comment immediately above a declaration: adjacent line comments, or one /** block. """
    anchor = node
    while anchor.parent is not None and anchor.parent.type in (
        "export_statement", "decorated_definition", "attribute_list", "template_declaration",
    ):
        anchor = anchor.parent
    parts: list[str] = []
    prev = anchor.prev_sibling
    while prev is not None and prev.type in skip_types:  # e.g. Rust #[derive] between doc and item
        anchor, prev = prev, prev.prev_sibling
    expected_row = anchor.start_point[0]
    while prev is not None and prev.type in comment_types and prev.end_point[0] >= expected_row - 1:
        raw = ctx.text(prev)
        if raw.startswith("/*") and not raw.startswith(("/**", "/*!")):
            break
        parts.append(raw)
        expected_row = prev.start_point[0]
        prev = prev.prev_sibling
    if not parts:
        return None
    parts.reverse()
    return clean_comment("\n".join(parts)) or None
