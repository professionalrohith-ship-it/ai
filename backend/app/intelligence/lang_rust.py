from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

DOC_TYPES = ("line_comment", "block_comment")


def _is_pub(node: Node) -> bool:
    return any(c.type == "visibility_modifier" for c in node.children)


def _attributes(ctx: Ctx, node: Node) -> list[str]:
    out = []
    prev = node.prev_sibling
    while prev is not None and prev.type in ("attribute_item", "line_comment", "block_comment"):
        if prev.type == "attribute_item":
            out.append(collapse(ctx.text(prev).removeprefix("#[").removesuffix("]"), 120))
        prev = prev.prev_sibling
    out.reverse()
    return out


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type == "parameter":
            out.append({"name": ctx.field(p, "pattern"), "type": ctx.field(p, "type") or None})
        elif p.type == "self_parameter":
            out.append({"name": ctx.text(p)})
    return out


def _flatten_use(ctx: Ctx, node: Node, prefix: str, out: list[tuple[str, str | None]]) -> None:
    t = node.type
    join = lambda tail: f"{prefix}::{tail}" if prefix else tail  # noqa: E731
    if t in ("identifier", "crate", "self", "super", "metavariable"):
        out.append((join(ctx.text(node)), None))
    elif t == "scoped_identifier":
        out.append((join(ctx.text(node)), None))
    elif t == "use_as_clause":
        path = node.child_by_field_name("path")
        out.append((join(ctx.text(path)), ctx.field(node, "alias") or None))
    elif t == "use_wildcard":
        inner = node.named_children[0] if node.named_children else None
        out.append((join(ctx.text(inner)) + "::*" if inner is not None else join("*"), None))
    elif t == "scoped_use_list":
        path = node.child_by_field_name("path")
        base = join(ctx.text(path)) if path is not None else prefix
        lst = node.child_by_field_name("list")
        for item in (lst.named_children if lst is not None else []):
            _flatten_use(ctx, item, base, out)
    elif t == "use_list":
        for item in node.named_children:
            _flatten_use(ctx, item, prefix, out)


def on_use(ctx: Ctx, node: Node, scope: Scope):
    argument = node.child_by_field_name("argument")
    if argument is None:
        return None
    paths: list[tuple[str, str | None]] = []
    _flatten_use(ctx, argument, "", paths)
    for path, alias in paths:
        ctx.add_import(node, path, "use", alias=alias)
    return None


def on_mod(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    body = node.child_by_field_name("body")
    if body is None:  # `mod foo;` pulls in foo.rs / foo/mod.rs
        ctx.add_import(node, name, "mod")
        ctx.add_symbol(name, "namespace", node, scope, exported=_is_pub(node))
        return None
    symbol = ctx.add_symbol(name, "namespace", node, scope, exported=_is_pub(node))
    return ctx.child_scope(scope, name, "namespace") if symbol else None


def _type(kind: str):
    def handler(ctx: Ctx, node: Node, scope: Scope):
        name = ctx.field(node, "name")
        bases: list[str] = []
        bounds = node.child_by_field_name("bounds")
        if bounds is not None:
            bases = [ctx.text(c) for c in bounds.named_children if c.type != "lifetime"]
        symbol = ctx.add_symbol(name, kind, node, scope, bases=bases, decorators=_attributes(ctx, node),
                                docstring=leading_comment(ctx, node, DOC_TYPES, ("attribute_item",)), exported=_is_pub(node))
        return ctx.child_scope(scope, name, "class") if symbol else None

    return handler


def on_impl(ctx: Ctx, node: Node, scope: Scope):
    target = ctx.field(node, "type").split("<")[0]
    trait = ctx.field(node, "trait").split("<")[0]
    if trait and target:
        ctx.add_relation(target, "implements", trait, node)
        for symbol in ctx.result.symbols:  # reflect it on the type's symbol when defined in this file
            if symbol.name == target and symbol.kind in ("struct", "enum") and trait not in symbol.interfaces:
                symbol.interfaces.append(trait)
    return Scope(target, "class") if target else None


def on_function(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    params = node.child_by_field_name("parameters")
    returns = ctx.field(node, "return_type") or None
    kind = "method" if scope.kind == "class" else "function"
    symbol = ctx.add_symbol(
        name, kind, node, scope, signature=f"{name}{collapse(ctx.text(params), 160)}" + (f" -> {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, decorators=_attributes(ctx, node),
        docstring=leading_comment(ctx, node, DOC_TYPES, ("attribute_item",)), exported=_is_pub(node) and scope.kind != "class",
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_const(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind == "function":
        return None
    ctx.add_symbol(ctx.field(node, "name"), "constant", node, scope, return_type=ctx.field(node, "type") or None,
                   docstring=leading_comment(ctx, node, DOC_TYPES, ("attribute_item",)), exported=_is_pub(node))
    return None


def on_type_item(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_symbol(ctx.field(node, "name"), "type_alias", node, scope, exported=_is_pub(node))
    return None


def on_macro(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_symbol(ctx.field(node, "name"), "macro", node, scope)
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is None:
        return None
    if fn.type == "identifier":
        ctx.add_call(scope, ctx.text(fn), node)
    elif fn.type == "scoped_identifier":
        ctx.add_call(scope, ctx.field(fn, "name"), node)
    elif fn.type == "field_expression":
        ctx.add_call(scope, ctx.field(fn, "field"), node)
    return None


HANDLERS = {
    "use_declaration": on_use,
    "mod_item": on_mod,
    "struct_item": _type("struct"),
    "enum_item": _type("enum"),
    "union_item": _type("struct"),
    "trait_item": _type("trait"),
    "impl_item": on_impl,
    "function_item": on_function,
    "function_signature_item": on_function,
    "const_item": on_const,
    "static_item": on_const,
    "type_item": on_type_item,
    "macro_definition": on_macro,
    "call_expression": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
