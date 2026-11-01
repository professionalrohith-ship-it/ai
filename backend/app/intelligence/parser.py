"""parse_source(): bytes in, ParseResult out. Never raises for malformed or odd input, never executes anything."""
from __future__ import annotations

from tree_sitter import Parser

from . import lang_c, lang_csharp, lang_go, lang_java, lang_js, lang_php, lang_python, lang_ruby, lang_rust
from .extract_base import Ctx, count_syntax_errors, walk
from .grammars import get_language, grammar_key
from .model import ParseResult

# grammar key -> (handlers, finalizer, language name stored on symbols)
_EXTRACTORS = {
    "python": (lang_python, "Python"),
    "javascript": (lang_js, "JavaScript"),
    "typescript": (lang_js, "TypeScript"),
    "tsx": (lang_js, "TypeScript"),
    "java": (lang_java, "Java"),
    "c": (lang_c, "C"),
    "cpp": (lang_c, "C++"),
    "csharp": (lang_csharp, "C#"),
    "go": (lang_go, "Go"),
    "rust": (lang_rust, "Rust"),
    "php": (lang_php, "PHP"),
    "ruby": (lang_ruby, "Ruby"),
}


class UnsupportedLanguage(Exception):
    pass


def is_supported(language: str | None, extension: str) -> bool:
    key = grammar_key(language, extension)
    return key is not None and get_language(key) is not None


class ParserPool:
    """tree-sitter parsers are not thread safe and cheap to keep: one set per worker."""

    def __init__(self) -> None:
        self._parsers: dict[str, Parser] = {}

    def get(self, key: str) -> Parser:
        parser = self._parsers.get(key)
        if parser is None:
            language = get_language(key)
            if language is None:
                raise UnsupportedLanguage(key)
            parser = self._parsers[key] = Parser(language)
        return parser


def parse_source(source: bytes, language: str | None, extension: str, pool: ParserPool | None = None) -> ParseResult:
    key = grammar_key(language, extension)
    if key is None or get_language(key) is None:
        raise UnsupportedLanguage(language or extension)
    module, display = _EXTRACTORS[key]
    parser = (pool or ParserPool()).get(key)
    tree = parser.parse(source)
    root = tree.root_node

    ctx = Ctx(display, source)
    walk(ctx, root, module.HANDLERS)
    module.finalize(ctx, root)
    result = ctx.result
    errors, first = count_syntax_errors(root)
    result.syntax_errors, result.first_error_line = errors, first
    return result
