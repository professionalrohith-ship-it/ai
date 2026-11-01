from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

TYPE_KINDS = {
    "class_declaration": "class", "interface_declaration": "interface", "trait_declaration": "trait",
    "enum_declaration": "enum",
}
INCLUDE_KINDS = ("require_expression", "require_once_expression", "include_expression", "include_once_expression")


def _attributes(ctx: Ctx, node: Node) -> list[str]:
    out = []
    for lst in node.children:
        if lst.type == "attribute_list":
            for group in lst.named_children:
                out += [collapse(ctx.text(a), 120) for a in group.named_children if a.type == "attribute"]
    return out


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type in ("simple_parameter", "property_promotion_parameter", "variadic_parameter"):
            entry = {"name": ctx.field(p, "name").lstrip("$"), "type": ctx.field(p, "type") or None}
            if p.child_by_field_name("default_value") is not None:
                entry["default"] = collapse(ctx.field(p, "default_value"), 60)
            if p.type == "variadic_parameter":
                entry["variadic"] = True
            out.append(entry)
    return out


def on_namespace(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name").replace("\\", ".")
    if name:
        ctx.namespace = name
        ctx.result.namespace = name
    return None


def on_use(ctx: Ctx, node: Node, scope: Scope):
    for clause in node.named_children:
        if clause.type != "namespace_use_clause":
            continue
        target = next((c for c in clause.named_children if c.type in ("qualified_name", "name")), None)
        if target is not None:
            ctx.add_import(node, ctx.text(target).lstrip("\\"), "use", alias=ctx.field(clause, "alias") or None)
    return None


def on_include(ctx: Ctx, node: Node, scope: Scope):
    literal = next((c for c in node.named_children if c.type in ("string", "encapsed_string")), None)
    if literal is not None:
        ctx.add_import(node, ctx.text(literal).strip("'\""), "require" if node.type.startswith("require") else "include")
    return None


def on_type(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    kind = TYPE_KINDS[node.type]
    base = next((c for c in node.children if c.type == "base_clause"), None)
    interface = next((c for c in node.children if c.type == "class_interface_clause"), None)
    bases = [ctx.text(c) for c in (base.named_children if base else [])]
    interfaces = [ctx.text(c) for c in (interface.named_children if interface else [])]
    if kind == "interface":
        bases, interfaces = bases, []
    symbol = ctx.add_symbol(name, kind, node, scope, bases=bases, interfaces=interfaces, decorators=_attributes(ctx, node),
                            docstring=leading_comment(ctx, node), exported=True)
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_trait_use(ctx: Ctx, node: Node, scope: Scope):
    for name in node.named_children:
        if name.type in ("name", "qualified_name"):
            ctx.add_relation(scope.qname, "uses", ctx.text(name), node)
    return None


def on_function(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    method = node.type == "method_declaration"
    params = node.child_by_field_name("parameters")
    returns = ctx.field(node, "return_type") or None
    symbol = ctx.add_symbol(
        name, ("constructor" if name == "__construct" else "method") if method else "function", node, scope,
        signature=f"{name}{collapse(ctx.text(params), 160)}" + (f": {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, decorators=_attributes(ctx, node),
        docstring=leading_comment(ctx, node), exported=not method,
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_property(ctx: Ctx, node: Node, scope: Scope):
    for element in node.named_children:
        if element.type == "property_element":
            ctx.add_symbol(ctx.field(element, "name").lstrip("$"), "property", node, scope,
                           return_type=ctx.field(node, "type") or None, docstring=leading_comment(ctx, node))
    return None


def on_const(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind == "function":
        return None
    for element in node.named_children:
        if element.type == "const_element":
            name = next((ctx.text(c) for c in element.named_children if c.type == "name"), "")
            ctx.add_symbol(name, "constant", node, scope, docstring=leading_comment(ctx, node))
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    if node.type == "function_call_expression":
        fn = node.child_by_field_name("function")
        if fn is not None and fn.type in ("name", "qualified_name"):
            ctx.add_call(scope, ctx.text(fn).split("\\")[-1], node)
    else:
        ctx.add_call(scope, ctx.field(node, "name"), node)
    return None


HANDLERS = {
    "namespace_definition": on_namespace,
    "namespace_use_declaration": on_use,
    "class_declaration": on_type,
    "interface_declaration": on_type,
    "trait_declaration": on_type,
    "enum_declaration": on_type,
    "use_declaration": on_trait_use,
    "method_declaration": on_function,
    "function_definition": on_function,
    "property_declaration": on_property,
    "const_declaration": on_const,
    "function_call_expression": on_call,
    "member_call_expression": on_call,
    "scoped_call_expression": on_call,
    **{kind: on_include for kind in INCLUDE_KINDS},
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
