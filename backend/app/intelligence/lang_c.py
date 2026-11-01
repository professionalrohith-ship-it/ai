"""C and C++ (the cpp grammar is a superset, so both share these handlers)."""
from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

DECLARATION_SCOPES = ("module", "class", "namespace")
WRAPPERS = ("pointer_declarator", "reference_declarator", "array_declarator", "parenthesized_declarator", "init_declarator")


def _unwrap(node: Node | None) -> Node | None:
    while node is not None and node.type in WRAPPERS:
        node = node.child_by_field_name("declarator") or (node.named_children[0] if node.named_children else None)
    return node


def _function_declarator(node: Node | None) -> Node | None:
    """The function_declarator inside a (possibly pointer-wrapped) declarator, or None."""
    node = _unwrap(node)
    return node if node is not None and node.type == "function_declarator" else None


def _name_and_owner(ctx: Ctx, declarator: Node | None) -> tuple[str, str | None]:
    node = _unwrap(declarator)
    if node is None:
        return "", None
    if node.type == "qualified_identifier":
        scope_text = ctx.field(node, "scope")
        name_node = node.child_by_field_name("name")
        return ctx.text(name_node), scope_text or None
    return ctx.text(node), None


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    for p in params.named_children:
        if p.type in ("parameter_declaration", "optional_parameter_declaration"):
            decl = _unwrap(p.child_by_field_name("declarator"))
            out.append({"name": ctx.text(decl) if decl is not None else "", "type": ctx.field(p, "type") or None})
        elif p.type == "variadic_parameter":
            out.append({"name": "...", "variadic": True})
    return out


def _bases(ctx: Ctx, node: Node) -> list[str]:
    clause = next((c for c in node.children if c.type == "base_class_clause"), None)
    return [ctx.text(c) for c in (clause.named_children if clause else []) if c.type != "access_specifier"]


def on_include(ctx: Ctx, node: Node, scope: Scope):
    path = node.child_by_field_name("path")
    if path is None:
        return None
    if path.type == "system_lib_string":
        ctx.add_import(node, ctx.text(path).strip("<>"), "include_system")
    else:
        ctx.add_import(node, ctx.text(path).strip('"'), "include")
    return None


def on_define(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind != "function":
        ctx.add_symbol(ctx.field(node, "name"), "macro", node, scope, docstring=leading_comment(ctx, node))
    return None


def on_namespace(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    if not name:
        return None
    symbol = ctx.add_symbol(name, "namespace", node, scope)
    return ctx.child_scope(scope, name, "namespace") if symbol else None


def on_type(kind: str):
    def handler(ctx: Ctx, node: Node, scope: Scope):
        name = ctx.field(node, "name")
        if not name or node.child_by_field_name("body") is None:
            return None  # forward declaration or anonymous
        symbol = ctx.add_symbol(name, kind, node, scope, bases=_bases(ctx, node), docstring=leading_comment(ctx, node))
        return ctx.child_scope(scope, name, "class") if symbol else None

    return handler


def on_function(ctx: Ctx, node: Node, scope: Scope):
    declarator = _function_declarator(node.child_by_field_name("declarator"))
    if declarator is None:
        return None
    name, owner = _name_and_owner(ctx, declarator.child_by_field_name("declarator"))
    if not name:
        return None
    effective = Scope(owner.replace("::", "."), "class") if owner else scope
    kind = "method" if effective.kind == "class" else "function"
    if kind == "method" and name == effective.qname.split(".")[-1]:
        kind = "constructor"
    params = declarator.child_by_field_name("parameters")
    returns = ctx.field(node, "type") or None
    symbol = ctx.add_symbol(
        name, kind, node, effective, signature=f"{name}{collapse(ctx.text(params), 160)}" + (f" -> {returns}" if returns else ""),
        parameters=_parameters(ctx, params), return_type=returns, docstring=leading_comment(ctx, node),
        exported=scope.kind != "class" and "static" not in {ctx.text(c) for c in node.children if c.type == "storage_class_specifier"},
    )
    return ctx.child_scope(effective, name, "function") if symbol else None


def on_declaration(ctx: Ctx, node: Node, scope: Scope):
    """Prototypes (functions/methods declared but not defined) and global variables."""
    if scope.kind == "function":
        return None
    declarators = node.children_by_field_name("declarator")
    qualifiers = {ctx.text(c) for c in node.children if c.type == "type_qualifier"}
    for declarator in declarators:
        fn = _function_declarator(declarator)
        if fn is not None:
            name, owner = _name_and_owner(ctx, fn.child_by_field_name("declarator"))
            if not name or name.startswith("~"):
                continue
            effective = Scope(owner.replace("::", "."), "class") if owner else scope
            params = fn.child_by_field_name("parameters")
            kind = "method" if effective.kind == "class" else "function"
            if kind == "method" and name == effective.qname.split(".")[-1]:
                kind = "constructor"
            ctx.add_symbol(name, kind, node, effective, signature=f"{name}{collapse(ctx.text(params), 160)}",
                           parameters=_parameters(ctx, params), return_type=ctx.field(node, "type") or None,
                           docstring=leading_comment(ctx, node))
            continue
        if scope.kind not in DECLARATION_SCOPES:
            continue
        target = _unwrap(declarator)
        if target is not None and target.type in ("identifier", "field_identifier"):
            ctx.add_symbol(ctx.text(target), "constant" if "const" in qualifiers else "variable", node, scope,
                           return_type=ctx.field(node, "type") or None)
    return None


def on_field_declaration(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind != "class":
        return None
    for declarator in node.children_by_field_name("declarator"):
        fn = _function_declarator(declarator)
        target = _unwrap(declarator)
        if fn is not None:
            name, _ = _name_and_owner(ctx, fn.child_by_field_name("declarator"))
            if name and not name.startswith("~"):
                params = fn.child_by_field_name("parameters")
                kind = "constructor" if name == scope.qname.split(".")[-1] else "method"
                ctx.add_symbol(name, kind, node, scope, signature=f"{name}{collapse(ctx.text(params), 160)}",
                               parameters=_parameters(ctx, params), return_type=ctx.field(node, "type") or None)
        elif target is not None and target.type == "field_identifier":
            ctx.add_symbol(ctx.text(target), "property", node, scope, return_type=ctx.field(node, "type") or None)
    return None


def on_typedef(ctx: Ctx, node: Node, scope: Scope):
    target = _unwrap(node.child_by_field_name("declarator"))
    if target is not None and target.type == "type_identifier":
        ctx.add_symbol(ctx.text(target), "type_alias", node, scope, docstring=leading_comment(ctx, node))
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is None:
        return None
    if fn.type == "identifier":
        ctx.add_call(scope, ctx.text(fn), node)
    elif fn.type == "field_expression":
        ctx.add_call(scope, ctx.field(fn, "field"), node)
    elif fn.type == "qualified_identifier":
        ctx.add_call(scope, ctx.field(fn, "name"), node)
    return None


HANDLERS = {
    "preproc_include": on_include,
    "preproc_def": on_define,
    "preproc_function_def": on_define,
    "namespace_definition": on_namespace,
    "class_specifier": on_type("class"),
    "struct_specifier": on_type("struct"),
    "union_specifier": on_type("struct"),
    "enum_specifier": on_type("enum"),
    "function_definition": on_function,
    "declaration": on_declaration,
    "field_declaration": on_field_declaration,
    "type_definition": on_typedef,
    "call_expression": on_call,
}


def finalize(ctx: Ctx, root: Node) -> None:
    pass
