from __future__ import annotations

import re

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

TYPE_KINDS = {
    "class_declaration": "class", "interface_declaration": "interface", "struct_declaration": "struct",
    "enum_declaration": "enum", "record_declaration": "record", "record_struct_declaration": "record",
}
_INTERFACE_NAME = re.compile(r"^I[A-Z]")  # C# convention; the grammar does not separate base class from interfaces


def _attributes(ctx: Ctx, node: Node) -> list[str]:
    out = []
    for lst in node.children:
        if lst.type == "attribute_list":
            out += [collapse(ctx.text(a), 120) for a in lst.named_children if a.type == "attribute"]
    return out


def _modifiers(ctx: Ctx, node: Node) -> set[str]:
    return {ctx.text(c) for c in node.children if c.type == "modifier"}


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type == "parameter":
            entry = {"name": ctx.field(p, "name"), "type": ctx.field(p, "type") or None}
            if p.child_by_field_name("name") is not None and len(p.named_children) > 2:
                entry["default"] = collapse(ctx.text(p.named_children[-1]), 60)
            out.append(entry)
    return out


def _bases(ctx: Ctx, node: Node, kind: str) -> tuple[list[str], list[str]]:
    base_list = next((c for c in node.children if c.type == "base_list"), None)
    if base_list is None:
        return [], []
    names = [ctx.text(c) for c in base_list.named_children if c.type != "argument_list"]
    if kind == "interface":
        return names, []
    bases, interfaces = [], []
    for index, name in enumerate(names):
        (interfaces if _INTERFACE_NAME.match(name.split(".")[-1]) or index > 0 else bases).append(name)
    return bases, interfaces


def _enter(ctx: Ctx, node: Node) -> None:
    """Qualified names carry the namespace: file-scoped (`namespace X;`) plus enclosing block namespaces."""
    parts = []
    parent = node.parent
    while parent is not None:
        if parent.type == "namespace_declaration":
            parts.append(ctx.field(parent, "name"))
        parent = parent.parent
    parts.append(getattr(ctx, "file_namespace", ""))
    ctx.namespace = ".".join(p for p in reversed(parts) if p)
    if ctx.namespace and not ctx.result.namespace:
        ctx.result.namespace = ctx.namespace


def on_namespace(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    if node.type == "file_scoped_namespace_declaration":
        ctx.file_namespace = name
    _enter(ctx, node)
    ctx.add_symbol(name, "namespace", node, scope)
    ctx.result.namespace = ctx.result.namespace or name
    return None


def on_type(ctx: Ctx, node: Node, scope: Scope):
    _enter(ctx, node)
    name = ctx.field(node, "name")
    kind = TYPE_KINDS[node.type]
    bases, interfaces = _bases(ctx, node, kind)
    symbol = ctx.add_symbol(
        name, kind, node, scope, bases=bases, interfaces=interfaces, decorators=_attributes(ctx, node),
        docstring=leading_comment(ctx, node), exported="public" in _modifiers(ctx, node) or "internal" in _modifiers(ctx, node),
    )
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_method(ctx: Ctx, node: Node, scope: Scope):
    _enter(ctx, node)
    name = ctx.field(node, "name")
    constructor = node.type == "constructor_declaration"
    params = node.child_by_field_name("parameters")
    returns = None if constructor else (ctx.field(node, "returns") or ctx.field(node, "type") or None)
    symbol = ctx.add_symbol(
        name, "constructor" if constructor else "method", node, scope,
        signature=f"{name}{collapse(ctx.text(params), 160)}" + (f": {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, decorators=_attributes(ctx, node),
        docstring=leading_comment(ctx, node),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_property(ctx: Ctx, node: Node, scope: Scope):
    _enter(ctx, node)
    ctx.add_symbol(ctx.field(node, "name"), "property", node, scope, return_type=ctx.field(node, "type") or None,
                   decorators=_attributes(ctx, node), docstring=leading_comment(ctx, node))
    return None


def on_field(ctx: Ctx, node: Node, scope: Scope):
    _enter(ctx, node)
    declaration = next((c for c in node.children if c.type == "variable_declaration"), None)
    if declaration is None:
        return None
    mods = _modifiers(ctx, node)
    constant = "const" in mods or ("static" in mods and "readonly" in mods)
    for declarator in declaration.named_children:
        if declarator.type == "variable_declarator":
            ctx.add_symbol(ctx.field(declarator, "name"), "constant" if constant else "variable", node, scope,
                           return_type=ctx.field(declaration, "type") or None, decorators=_attributes(ctx, node),
                           docstring=leading_comment(ctx, node))
    return None


def on_using(ctx: Ctx, node: Node, scope: Scope):
    name_node = node.child_by_field_name("name")
    target = next((c for c in node.named_children if c.type in ("identifier", "qualified_name") and name_node is None or c.id != name_node.id), None)
    if target is None:
        return None
    static = any(not c.is_named and ctx.text(c) == "static" for c in node.children)
    ctx.add_import(node, ctx.text(target), "using", alias=ctx.text(name_node) or None if name_node is not None else None)
    if static:
        ctx.result.imports[-1].kind = "import_static"
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is None:
        return None
    if fn.type == "member_access_expression":
        ctx.add_call(scope, ctx.field(fn, "name"), node)
    elif fn.type in ("identifier", "generic_name"):
        ctx.add_call(scope, ctx.text(fn).split("<")[0], node)
    return None


HANDLERS = {
    "namespace_declaration": on_namespace,
    "file_scoped_namespace_declaration": on_namespace,
    "class_declaration": on_type,
    "interface_declaration": on_type,
    "struct_declaration": on_type,
    "enum_declaration": on_type,
    "record_declaration": on_type,
    "record_struct_declaration": on_type,
    "method_declaration": on_method,
    "constructor_declaration": on_method,
    "property_declaration": on_property,
    "field_declaration": on_field,
    "using_directive": on_using,
    "invocation_expression": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
