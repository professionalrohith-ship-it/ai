from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

MIXINS = ("include", "extend", "prepend")
REQUIRES = ("require", "require_relative", "load")


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        t = p.type
        if t == "identifier":
            out.append({"name": ctx.text(p)})
        elif t in ("optional_parameter", "keyword_parameter"):
            entry = {"name": ctx.field(p, "name")}
            if p.child_by_field_name("value") is not None:
                entry["default"] = collapse(ctx.field(p, "value"), 60)
            out.append(entry)
        elif t in ("splat_parameter", "hash_splat_parameter", "block_parameter"):
            out.append({"name": ctx.field(p, "name"), "variadic": t != "block_parameter"})
    return out


def on_class(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    superclass = node.child_by_field_name("superclass")
    bases = [ctx.text(c) for c in superclass.named_children] if superclass is not None else []
    symbol = ctx.add_symbol(name, "class", node, scope, bases=bases, docstring=leading_comment(ctx, node), exported=True)
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_module(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    symbol = ctx.add_symbol(name, "namespace", node, scope, docstring=leading_comment(ctx, node), exported=True)
    return ctx.child_scope(scope, name, "namespace") if symbol else None


def on_method(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    params = node.child_by_field_name("parameters")
    symbol = ctx.add_symbol(
        name, "constructor" if name == "initialize" else "method" if scope.kind == "class" or node.type == "singleton_method" else "function",
        node, scope, signature=f"{name}{collapse(ctx.text(params), 160)}" if params is not None else name,
        parameters=_parameters(ctx, params), docstring=leading_comment(ctx, node),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_assignment(ctx: Ctx, node: Node, scope: Scope):
    left = node.child_by_field_name("left")
    if scope.kind in ("module", "class", "namespace") and left is not None and left.type == "constant":
        ctx.add_symbol(ctx.text(left), "constant", node, scope, docstring=leading_comment(ctx, node), exported=True)
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    method = ctx.field(node, "method")
    args = node.child_by_field_name("arguments")
    first = args.named_children[0] if args is not None and args.named_children else None
    if method in REQUIRES and first is not None and first.type == "string":
        text = "".join(ctx.text(c) for c in first.named_children if c.type == "string_content")
        ctx.add_import(node, text, "require" if method == "require" else method)
        return None
    if method in MIXINS and first is not None and node.child_by_field_name("receiver") is None:
        ctx.add_relation(scope.qname, "includes", ctx.text(first), node)
        return None
    ctx.add_call(scope, method, node)
    return None


HANDLERS = {
    "class": on_class,
    "module": on_module,
    "method": on_method,
    "singleton_method": on_method,
    "assignment": on_assignment,
    "call": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
