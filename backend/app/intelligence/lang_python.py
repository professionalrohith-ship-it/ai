from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse

DECLARATION_SCOPES = ("module", "class")


def _string_value(ctx: Ctx, node: Node) -> str:
    if node.type == "string":
        parts = [ctx.text(c) for c in node.children if c.type == "string_content"]
        return "".join(parts)
    return ""


def _docstring(ctx: Ctx, body: Node | None) -> str | None:
    if body is None or not body.named_children:
        return None
    first = body.named_children[0]
    if first.type == "expression_statement" and first.named_children and first.named_children[0].type == "string":
        text = _string_value(ctx, first.named_children[0]).strip()
        return collapse(text, 600) if text else None
    return None


def _decorators(ctx: Ctx, node: Node) -> list[str]:
    parent = node.parent
    if parent is None or parent.type != "decorated_definition":
        return []
    return [collapse(ctx.text(d).lstrip("@"), 120) for d in parent.children if d.type == "decorator"]


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        t = p.type
        if t == "identifier":
            out.append({"name": ctx.text(p)})
        elif t == "typed_parameter":
            name = next((c for c in p.named_children if c.type in ("identifier", "list_splat_pattern", "dictionary_splat_pattern")), None)
            out.append({"name": ctx.text(name).lstrip("*"), "type": ctx.field(p, "type") or None})
        elif t in ("default_parameter", "typed_default_parameter"):
            entry = {"name": ctx.field(p, "name"), "default": collapse(ctx.field(p, "value"), 60)}
            if t == "typed_default_parameter":
                entry["type"] = ctx.field(p, "type")
            out.append(entry)
        elif t in ("list_splat_pattern", "dictionary_splat_pattern"):
            out.append({"name": ctx.text(p).lstrip("*"), "variadic": True})
    return out


def _is_constant(name: str) -> bool:
    return name.isupper() or (name.replace("_", "").isupper() and any(c.isalpha() for c in name))


def on_class(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    supers = node.child_by_field_name("superclasses")
    bases = [ctx.text(c) for c in (supers.named_children if supers else []) if c.type not in ("keyword_argument", "comment")]
    symbol = ctx.add_symbol(
        name, "class", node, scope, bases=bases, decorators=_decorators(ctx, node),
        docstring=_docstring(ctx, node.child_by_field_name("body")),
    )
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_function(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    kind = "method" if scope.kind == "class" else "function"
    if kind == "method" and name == "__init__":
        kind = "constructor"
    params_node = node.child_by_field_name("parameters")
    returns = ctx.field(node, "return_type") or None
    is_async = any(c.type == "async" for c in node.children)
    signature = ("async " if is_async else "") + f"{name}{collapse(ctx.text(params_node), 160)}" + (f" -> {returns}" if returns else "")
    symbol = ctx.add_symbol(
        name, kind, node, scope, signature=signature, parameters=_parameters(ctx, params_node),
        return_type=returns, decorators=_decorators(ctx, node),
        docstring=_docstring(ctx, node.child_by_field_name("body")),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_assignment(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind not in DECLARATION_SCOPES:
        return None
    left = node.child_by_field_name("left")
    right = node.child_by_field_name("right")
    if left is None:
        return None
    annotation = ctx.field(node, "type") or None
    if left.type == "identifier":
        name = ctx.text(left)
        if name == "__all__" and right is not None and right.type in ("list", "tuple"):
            ctx.export_names.update(_string_value(ctx, c) for c in right.named_children if c.type == "string")
            return None
        ctx.add_symbol(name, "constant" if _is_constant(name) else "variable", node, scope, return_type=annotation)
    elif left.type in ("pattern_list", "tuple_pattern"):
        for target in left.named_children:
            if target.type == "identifier":
                name = ctx.text(target)
                ctx.add_symbol(name, "constant" if _is_constant(name) else "variable", node, scope)
    return None


def on_import(ctx: Ctx, node: Node, scope: Scope):
    for child in node.named_children:
        if child.type == "dotted_name":
            ctx.add_import(node, ctx.text(child), "import")
        elif child.type == "aliased_import":
            ctx.add_import(node, ctx.field(child, "name"), "import", alias=ctx.field(child, "alias") or None)
    return None


def on_import_from(ctx: Ctx, node: Node, scope: Scope):
    module_node = node.child_by_field_name("module_name")
    level, dotted = 0, ""
    if module_node is not None:
        if module_node.type == "relative_import":
            prefix = next((c for c in module_node.children if c.type == "import_prefix"), None)
            level = len(ctx.text(prefix))
            dotted = "".join(ctx.text(c) for c in module_node.named_children if c.type == "dotted_name")
        else:
            dotted = ctx.text(module_node)
    names: list[str] = []
    for child in node.children_by_field_name("name"):
        names.append(ctx.field(child, "name") if child.type == "aliased_import" else ctx.text(child))
    if any(c.type == "wildcard_import" for c in node.children):
        names.append("*")
    ctx.add_import(node, "." * level + dotted, "from", names, level=level)
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is not None:
        if fn.type == "identifier":
            ctx.add_call(scope, ctx.text(fn), node)
        elif fn.type == "attribute":
            ctx.add_call(scope, ctx.field(fn, "attribute"), node)
    return None


HANDLERS = {
    "class_definition": on_class,
    "function_definition": on_function,
    "assignment": on_assignment,
    "import_statement": on_import,
    "import_from_statement": on_import_from,
    "call": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    ctx.result.module_docstring = _docstring(ctx, root)
    for symbol in ctx.result.symbols:
        if symbol.parent is None:
            symbol.exported = symbol.name in ctx.export_names if ctx.export_names else not symbol.name.startswith("_")
