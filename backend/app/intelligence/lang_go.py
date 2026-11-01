from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment


def _exported(name: str) -> bool:
    return name[:1].isupper()


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type in ("parameter_declaration", "variadic_parameter_declaration"):
            type_text = ctx.field(p, "type")
            names = [ctx.text(n) for n in p.children_by_field_name("name")] or [""]
            for name in names:
                entry = {"name": name, "type": type_text or None}
                if p.type == "variadic_parameter_declaration":
                    entry["variadic"] = True
                out.append(entry)
    return out


def _result(ctx: Ctx, node: Node) -> str | None:
    result = node.child_by_field_name("result")
    return collapse(ctx.text(result), 100) if result is not None else None


def _receiver_type(ctx: Ctx, node: Node) -> str:
    receiver = node.child_by_field_name("receiver")
    if receiver is None or not receiver.named_children:
        return ""
    type_node = receiver.named_children[0].child_by_field_name("type")
    return ctx.text(type_node).lstrip("*").split("[")[0] if type_node is not None else ""


def on_package(ctx: Ctx, node: Node, scope: Scope):
    ctx.namespace = ctx.text(node.named_children[0]) if node.named_children else ""
    ctx.result.namespace = ctx.namespace
    return None


def on_import_spec(ctx: Ctx, node: Node, scope: Scope):
    path = node.child_by_field_name("path")
    if path is not None:
        alias = ctx.field(node, "name") or None
        ctx.add_import(node, ctx.text(path).strip('"`'), "import", alias=alias)
    return None


def on_function(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    params = node.child_by_field_name("parameters")
    returns = _result(ctx, node)
    symbol = ctx.add_symbol(
        name, "function", node, scope, signature=f"{name}{collapse(ctx.text(params), 160)}" + (f" {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, docstring=leading_comment(ctx, node), exported=_exported(name),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_method(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    receiver = _receiver_type(ctx, node)
    owner = Scope(receiver, "class") if receiver else scope
    params = node.child_by_field_name("parameters")
    returns = _result(ctx, node)
    symbol = ctx.add_symbol(
        name, "method", node, owner, signature=f"({receiver}) {name}{collapse(ctx.text(params), 160)}" + (f" {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, docstring=leading_comment(ctx, node), exported=_exported(name),
    )
    return ctx.child_scope(owner, name, "function") if symbol else None


def on_type_spec(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    body = node.child_by_field_name("type")
    kind, bases = "type_alias", []
    if body is not None and body.type == "struct_type":
        kind = "struct"
        fields = next((c for c in body.named_children if c.type == "field_declaration_list"), None)
        for f in (fields.named_children if fields else []):
            if f.type == "field_declaration" and not f.children_by_field_name("name"):
                bases.append(ctx.field(f, "type").lstrip("*"))  # embedded type
    elif body is not None and body.type == "interface_type":
        kind = "interface"
        for elem in body.named_children:
            if elem.type == "type_elem":
                bases += [ctx.text(t) for t in elem.named_children]
    docs = leading_comment(ctx, node.parent if node.parent is not None and node.parent.type == "type_declaration" else node)
    symbol = ctx.add_symbol(name, kind, node, scope, bases=bases, docstring=docs, exported=_exported(name))
    if symbol and kind == "interface" and body is not None:
        for elem in body.named_children:
            if elem.type == "method_elem":
                mname = ctx.field(elem, "name")
                ctx.add_symbol(mname, "method", elem, ctx.child_scope(scope, name, "class"),
                               signature=f"{mname}{collapse(ctx.field(elem, 'parameters'), 160)}",
                               parameters=_parameters(ctx, elem.child_by_field_name("parameters")), return_type=_result(ctx, elem),
                               exported=_exported(mname))
    return ctx.child_scope(scope, name, "class") if symbol and kind == "struct" else None


def on_type_alias(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    ctx.add_symbol(name, "type_alias", node, scope, exported=_exported(name))
    return None


def _value_specs(ctx: Ctx, node: Node, scope: Scope, kind: str) -> None:
    if scope.kind != "module":
        return
    for name_node in node.children_by_field_name("name"):
        name = ctx.text(name_node)
        ctx.add_symbol(name, kind, node, scope, return_type=ctx.field(node, "type") or None, exported=_exported(name))


def on_const(ctx: Ctx, node: Node, scope: Scope):
    _value_specs(ctx, node, scope, "constant")
    return None


def on_var(ctx: Ctx, node: Node, scope: Scope):
    _value_specs(ctx, node, scope, "variable")
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is None:
        return None
    if fn.type == "identifier":
        ctx.add_call(scope, ctx.text(fn), node)
    elif fn.type == "selector_expression":
        ctx.add_call(scope, ctx.field(fn, "field"), node)
    return None


HANDLERS = {
    "package_clause": on_package,
    "import_spec": on_import_spec,
    "function_declaration": on_function,
    "method_declaration": on_method,
    "type_spec": on_type_spec,
    "type_alias": on_type_alias,
    "const_spec": on_const,
    "var_spec": on_var,
    "call_expression": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
