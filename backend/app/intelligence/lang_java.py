from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

DOC_TYPES = ("block_comment", "line_comment")
TYPE_KINDS = {
    "class_declaration": "class", "interface_declaration": "interface", "enum_declaration": "enum",
    "record_declaration": "record", "annotation_type_declaration": "interface",
}


def _modifiers(node: Node) -> Node | None:
    return next((c for c in node.children if c.type == "modifiers"), None)


def _annotations(ctx: Ctx, node: Node) -> list[str]:
    mods = _modifiers(node)
    if mods is None:
        return []
    return [collapse(ctx.text(a).lstrip("@"), 120) for a in mods.children if a.type in ("annotation", "marker_annotation")]


def _has_modifier(ctx: Ctx, node: Node, word: str) -> bool:
    mods = _modifiers(node)
    return mods is not None and any(not c.is_named and ctx.text(c) == word for c in mods.children)


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type == "formal_parameter":
            out.append({"name": ctx.field(p, "name"), "type": ctx.field(p, "type")})
        elif p.type == "spread_parameter":
            decl = next((c for c in p.named_children if c.type == "variable_declarator"), None)
            kind = next((c for c in p.named_children if c.type != "variable_declarator" and c.type != "modifiers"), None)
            out.append({"name": ctx.field(decl, "name") if decl else "", "type": ctx.text(kind), "variadic": True})
    return out


def on_package(ctx: Ctx, node: Node, scope: Scope):
    ctx.namespace = ctx.text(node.named_children[0]) if node.named_children else ""
    ctx.result.namespace = ctx.namespace
    return None


def on_import(ctx: Ctx, node: Node, scope: Scope):
    path = next((c for c in node.named_children if c.type in ("scoped_identifier", "identifier")), None)
    if path is None:
        return None
    wildcard = any(c.type == "asterisk" for c in node.children)
    static = any(not c.is_named and ctx.text(c) == "static" for c in node.children)
    ctx.add_import(node, ctx.text(path), "import_static" if static else "import", ["*"] if wildcard else [])
    return None


def on_type(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    kind = TYPE_KINDS[node.type]
    bases: list[str] = []
    interfaces: list[str] = []
    superclass = node.child_by_field_name("superclass")
    if superclass is not None:
        bases = [ctx.text(c) for c in superclass.named_children]
    implemented = node.child_by_field_name("interfaces")
    if implemented is not None:
        interfaces = [ctx.text(t) for lst in implemented.named_children for t in (lst.named_children if lst.type == "type_list" else [lst])]
    for child in node.children:  # interface X extends A, B
        if child.type == "extends_interfaces":
            bases += [ctx.text(t) for lst in child.named_children for t in lst.named_children]
    symbol = ctx.add_symbol(
        name, kind, node, scope, bases=bases, interfaces=interfaces, decorators=_annotations(ctx, node),
        docstring=leading_comment(ctx, node, DOC_TYPES), exported=scope.kind == "module" and _has_modifier(ctx, node, "public"),
    )
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_method(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    constructor = node.type == "constructor_declaration"
    params = node.child_by_field_name("parameters")
    returns = None if constructor else (ctx.field(node, "type") or None)
    symbol = ctx.add_symbol(
        name, "constructor" if constructor else "method", node, scope,
        signature=f"{name}{collapse(ctx.text(params), 160)}" + (f": {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, decorators=_annotations(ctx, node),
        docstring=leading_comment(ctx, node, DOC_TYPES),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_field(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind != "class":
        return None
    constant = _has_modifier(ctx, node, "final") and _has_modifier(ctx, node, "static")
    for decl in node.children_by_field_name("declarator"):
        ctx.add_symbol(ctx.field(decl, "name"), "constant" if constant else "variable", node, scope,
                       return_type=ctx.field(node, "type") or None, decorators=_annotations(ctx, node),
                       docstring=leading_comment(ctx, node, DOC_TYPES))
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_call(scope, ctx.field(node, "name"), node)
    return None


def on_new(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_call(scope, ctx.field(node, "type"), node)
    return None


HANDLERS = {
    "package_declaration": on_package,
    "import_declaration": on_import,
    "class_declaration": on_type,
    "interface_declaration": on_type,
    "enum_declaration": on_type,
    "record_declaration": on_type,
    "annotation_type_declaration": on_type,
    "method_declaration": on_method,
    "constructor_declaration": on_method,
    "field_declaration": on_field,
    "method_invocation": on_call,
    "object_creation_expression": on_new,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
