"""Plain data produced by the language extractors. Nothing here depends on tree-sitter or SQLite."""
from __future__ import annotations

from dataclasses import dataclass, field

CLASS_KINDS = ("class", "interface", "enum", "struct", "trait", "record")
FUNCTION_KINDS = ("function", "method", "constructor")


@dataclass(slots=True)
class Symbol:
    name: str
    kind: str
    qualified_name: str
    parent: str | None  # enclosing scope within the file (relative qualified name), None at top level
    start_line: int
    end_line: int
    language: str
    signature: str | None = None
    parameters: list[dict] = field(default_factory=list)
    return_type: str | None = None
    decorators: list[str] = field(default_factory=list)
    bases: list[str] = field(default_factory=list)  # extends / embeds / superclass
    interfaces: list[str] = field(default_factory=list)  # implements
    docstring: str | None = None
    exported: bool = False


@dataclass(slots=True)
class ImportRef:
    module: str  # raw specifier as written: "os.path", "./x", "java.util.List", "<vector>", ".pkg"
    kind: str  # import | from | require | dynamic_import | export_from | include | include_system | using | use | mod | import_static | import_type
    line: int
    names: list[str] = field(default_factory=list)
    alias: str | None = None
    level: int = 0  # leading dots of a Python relative import


@dataclass(slots=True)
class Relation:
    source: str  # qualified symbol name within the file ("" = the module itself)
    relation: str  # extends | implements | decorated_by | uses | includes | calls
    target: str
    line: int


@dataclass
class ParseResult:
    language: str
    symbols: list[Symbol] = field(default_factory=list)
    imports: list[ImportRef] = field(default_factory=list)
    relations: list[Relation] = field(default_factory=list)
    module_docstring: str | None = None
    namespace: str | None = None
    syntax_errors: int = 0
    first_error_line: int | None = None
    truncated: bool = False
