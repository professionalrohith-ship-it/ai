"""JavaScript, JSX, TypeScript and TSX share one extractor: the TypeScript grammar is a superset."""
from __future__ import annotations

from tree_sitter import Node

from .extract_base import Ctx, Scope, collapse, leading_comment

DECLARATION_SCOPES = ("module", "class", "namespace")
FUNCTION_VALUES = ("arrow_function", "function_expression", "function", "generator_function")


def _decorators(ctx: Ctx, node: Node) -> list[str]:
    nodes = [c for c in node.children if c.type == "decorator"]
    if node.parent is not None and node.parent.type == "export_statement":
        nodes = [c for c in node.parent.children if c.type == "decorator"] + nodes
    return [collapse(ctx.text(d).lstrip("@"), 120) for d in nodes]


def _exported(node: Node) -> bool:
    current = node
    for _ in range(3):
        if current.parent is None:
            return False
        if current.parent.type == "export_statement":
            return True
        current = current.parent
    return False


def _strip_type(text: str) -> str | None:
    text = text.strip()
    return text[1:].strip() or None if text.startswith(":") else (text or None)


def _parameters(ctx: Ctx, params: Node | None) -> list[dict]:
    out: list[dict] = []
    if params is None:
        return out
    if params.type == "identifier":  # arrow function with a single bare parameter
        return [{"name": ctx.text(params)}]
    for p in params.named_children:
        t = p.type
        if t == "identifier":
            out.append({"name": ctx.text(p)})
        elif t in ("required_parameter", "optional_parameter"):
            pattern = p.child_by_field_name("pattern")
            entry = {"name": ctx.text(pattern).lstrip(".") or ctx.text(p)}
            kind_type = _strip_type(ctx.field(p, "type"))
            if kind_type:
                entry["type"] = kind_type
            if t == "optional_parameter":
                entry["optional"] = True
            if p.child_by_field_name("value") is not None:
                entry["default"] = collapse(ctx.field(p, "value"), 60)
            if pattern is not None and pattern.type == "rest_pattern":
                entry["variadic"] = True
            out.append(entry)
        elif t == "assignment_pattern":
            out.append({"name": ctx.field(p, "left"), "default": collapse(ctx.field(p, "right"), 60)})
        elif t == "rest_pattern":
            out.append({"name": ctx.text(p).lstrip("."), "variadic": True})
        elif t in ("object_pattern", "array_pattern"):
            out.append({"name": collapse(ctx.text(p), 40)})
    return out


def _signature(ctx: Ctx, name: str, params: Node | None, returns: str | None, prefix: str = "") -> str:
    shown = collapse(ctx.text(params), 160) if params is not None else "()"
    return f"{prefix}{name}{shown}" + (f": {returns}" if returns else "")


def _heritage(ctx: Ctx, node: Node) -> tuple[list[str], list[str]]:
    bases: list[str] = []
    interfaces: list[str] = []
    for child in node.children:
        if child.type != "class_heritage":
            continue
        typed = False
        for part in child.named_children:
            if part.type == "extends_clause":
                typed = True
                bases += [ctx.text(v) for v in part.children_by_field_name("value")]
            elif part.type == "implements_clause":
                typed = True
                interfaces += [ctx.text(t) for t in part.named_children]
        if not typed:  # plain JavaScript: "extends <expression>"
            bases += [ctx.text(n) for n in child.named_children]
    return bases, interfaces


def _class(ctx: Ctx, node: Node, scope: Scope, name: str, decl: Node | None = None):
    bases, interfaces = _heritage(ctx, node)
    holder = decl or node
    symbol = ctx.add_symbol(
        name, "class", holder, scope, bases=bases, interfaces=interfaces, decorators=_decorators(ctx, holder),
        docstring=leading_comment(ctx, holder), exported=scope.kind == "module" and _exported(holder),
    )
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_class(ctx: Ctx, node: Node, scope: Scope):
    return _class(ctx, node, scope, ctx.field(node, "name"))


def on_interface(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    ext = next((c for c in node.children if c.type == "extends_type_clause"), None)
    bases = [ctx.text(c) for c in ext.children_by_field_name("type")] if ext else []
    symbol = ctx.add_symbol(name, "interface", node, scope, bases=bases, docstring=leading_comment(ctx, node),
                            exported=scope.kind == "module" and _exported(node))
    return ctx.child_scope(scope, name, "class") if symbol else None


def on_function(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name")
    params = node.child_by_field_name("parameters")
    returns = _strip_type(ctx.field(node, "return_type"))
    is_async = any(c.type == "async" for c in node.children)
    symbol = ctx.add_symbol(
        name, "function", node, scope, signature=_signature(ctx, name, params, returns, "async " if is_async else ""),
        parameters=_parameters(ctx, params), return_type=returns, docstring=leading_comment(ctx, node),
        exported=scope.kind == "module" and _exported(node),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_method(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind != "class":
        return None
    name_node = node.child_by_field_name("name")
    if name_node is None or name_node.type == "computed_property_name":
        return None
    name = ctx.text(name_node)
    params = node.child_by_field_name("parameters")
    returns = _strip_type(ctx.field(node, "return_type"))
    is_async = any(c.type == "async" for c in node.children)
    symbol = ctx.add_symbol(
        name, "constructor" if name == "constructor" else "method", node, scope,
        signature=_signature(ctx, name, params, returns, "async " if is_async else ""),
        parameters=_parameters(ctx, params), return_type=returns, decorators=_decorators(ctx, node),
        docstring=leading_comment(ctx, node),
    )
    return ctx.child_scope(scope, name, "function") if symbol else None


def on_field(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind != "class":
        return None
    name_node = node.child_by_field_name("name") or node.child_by_field_name("property")
    if name_node is None or name_node.type == "computed_property_name":
        return None
    ctx.add_symbol(ctx.text(name_node), "property", node, scope, return_type=_strip_type(ctx.field(node, "type")),
                   decorators=_decorators(ctx, node), docstring=leading_comment(ctx, node))
    return None


def on_type_alias(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_symbol(ctx.field(node, "name"), "type_alias", node, scope, docstring=leading_comment(ctx, node),
                   exported=scope.kind == "module" and _exported(node))
    return None


def on_enum(ctx: Ctx, node: Node, scope: Scope):
    ctx.add_symbol(ctx.field(node, "name"), "enum", node, scope, docstring=leading_comment(ctx, node),
                   exported=scope.kind == "module" and _exported(node))
    return None


def on_namespace(ctx: Ctx, node: Node, scope: Scope):
    name = ctx.field(node, "name").strip("'\"")
    symbol = ctx.add_symbol(name, "namespace", node, scope, exported=scope.kind == "module" and _exported(node))
    return ctx.child_scope(scope, name, "namespace") if symbol else None


def on_declarator(ctx: Ctx, node: Node, scope: Scope):
    if scope.kind not in DECLARATION_SCOPES:
        return None
    name_node = node.child_by_field_name("name")
    if name_node is None or name_node.type != "identifier":
        return None
    name = ctx.text(name_node)
    value = node.child_by_field_name("value")
    exported = scope.kind == "module" and _exported(node)
    if value is not None and value.type in FUNCTION_VALUES:
        params = value.child_by_field_name("parameters") or value.child_by_field_name("parameter")
        returns = _strip_type(ctx.field(value, "return_type"))
        symbol = ctx.add_symbol(
            name, "function", node, scope, signature=_signature(ctx, name, params, returns),
            parameters=_parameters(ctx, params), return_type=returns, exported=exported,
            docstring=leading_comment(ctx, node.parent if node.parent is not None else node),
        )
        return ctx.child_scope(scope, name, "function") if symbol else None
    if value is not None and value.type == "class":
        return _class(ctx, value, scope, name, decl=node)
    declaration = node.parent
    is_const = declaration is not None and ctx.text(declaration).lstrip().startswith("const")
    ctx.add_symbol(name, "constant" if is_const else "variable", node, scope, exported=exported,
                   return_type=_strip_type(ctx.field(node, "type")))
    return None


def _source(ctx: Ctx, node: Node) -> str | None:
    source = node.child_by_field_name("source")
    if source is None:
        for child in node.children:  # import x = require("y")
            if child.type == "import_require_clause":
                source = child.child_by_field_name("source")
    return ctx.text(source).strip("'\"`") if source is not None else None


def on_import(ctx: Ctx, node: Node, scope: Scope):
    module = _source(ctx, node)
    if module is None:
        return None
    names: list[str] = []
    alias = None
    for clause in node.children:
        if clause.type != "import_clause":
            continue
        for part in clause.named_children:
            if part.type == "identifier":
                names.append("default")
                alias = ctx.text(part)
            elif part.type == "namespace_import":
                names.append("*")
                alias = ctx.text(part.named_children[0]) if part.named_children else None
            elif part.type == "named_imports":
                for spec in part.named_children:
                    if spec.type == "import_specifier":
                        names.append(ctx.field(spec, "name"))
    is_type = ctx.text(node).lstrip().startswith("import type")
    ctx.add_import(node, module, "import_type" if is_type else "import", names, alias)
    return None


def on_export(ctx: Ctx, node: Node, scope: Scope):
    source = node.child_by_field_name("source")
    clause = next((c for c in node.children if c.type == "export_clause"), None)
    names = [ctx.field(s, "name") for s in clause.named_children if s.type == "export_specifier"] if clause else []
    if source is not None:
        ctx.add_import(node, ctx.text(source).strip("'\"`"), "export_from", names or ["*"])
    elif names:
        ctx.export_names.update(names)
    else:
        value = node.child_by_field_name("value")
        if value is not None and value.type == "identifier":
            ctx.export_names.add(ctx.text(value))
    return None


def on_call(ctx: Ctx, node: Node, scope: Scope):
    fn = node.child_by_field_name("function")
    if fn is None:
        return None
    args = node.child_by_field_name("arguments")
    first = args.named_children[0] if args is not None and args.named_children else None
    literal = ctx.text(first).strip("'\"") if first is not None and first.type == "string" else None
    if fn.type == "identifier":
        name = ctx.text(fn)
        if name == "require" and literal:
            ctx.add_import(node, literal, "require")
            return None
        ctx.add_call(scope, name, node)
    elif fn.type == "import" and literal:
        ctx.add_import(node, literal, "dynamic_import")
    elif fn.type == "member_expression":
        ctx.add_call(scope, ctx.field(fn, "property"), node)
    return None


def on_new(ctx: Ctx, node: Node, scope: Scope):
    ctor = node.child_by_field_name("constructor")
    if ctor is not None and ctor.type == "identifier":
        ctx.add_call(scope, ctx.text(ctor), node)
    return None


HANDLERS = {
    "class_declaration": on_class,
    "abstract_class_declaration": on_class,
    "interface_declaration": on_interface,
    "function_declaration": on_function,
    "generator_function_declaration": on_function,
    "function_signature": on_function,
    "method_definition": on_method,
    "method_signature": on_method,
    "abstract_method_signature": on_method,
    "public_field_definition": on_field,
    "field_definition": on_field,
    "property_signature": on_field,
    "type_alias_declaration": on_type_alias,
    "enum_declaration": on_enum,
    "internal_module": on_namespace,
    "module": on_namespace,
    "variable_declarator": on_declarator,
    "import_statement": on_import,
    "export_statement": on_export,
    "call_expression": on_call,
    "new_expression": on_new,
}


def finalize(ctx: Ctx, root: Node) -> None:
    for symbol in ctx.result.symbols:
        if symbol.parent is None and symbol.name in ctx.export_names:
            symbol.exported = True
