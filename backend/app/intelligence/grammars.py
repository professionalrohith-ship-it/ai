"""Grammar registry. Grammars are imported lazily so a missing optional grammar only disables that language."""
from __future__ import annotations

import importlib
from functools import lru_cache

import tree_sitter

# (our language name, file extension or None) -> (python module, loader function)
_GRAMMARS: dict[str, tuple[str, str]] = {
    "python": ("tree_sitter_python", "language"),
    "javascript": ("tree_sitter_javascript", "language"),
    "typescript": ("tree_sitter_typescript", "language_typescript"),
    "tsx": ("tree_sitter_typescript", "language_tsx"),
    "java": ("tree_sitter_java", "language"),
    "c": ("tree_sitter_c", "language"),
    "cpp": ("tree_sitter_cpp", "language"),
    "csharp": ("tree_sitter_c_sharp", "language"),
    "go": ("tree_sitter_go", "language"),
    "rust": ("tree_sitter_rust", "language"),
    "php": ("tree_sitter_php", "language_php"),
    "ruby": ("tree_sitter_ruby", "language"),
}

#: Stage 2 language name -> grammar key (the extension decides between typescript and tsx).
STAGE2_TO_GRAMMAR = {
    "Python": "python", "JavaScript": "javascript", "TypeScript": "typescript", "Java": "java", "C": "c",
    "C++": "cpp", "C#": "csharp", "Go": "go", "Rust": "rust", "PHP": "php", "Ruby": "ruby",
}


def grammar_key(language: str | None, extension: str) -> str | None:
    key = STAGE2_TO_GRAMMAR.get(language or "")
    if key == "typescript" and extension == ".tsx":
        return "tsx"
    return key


def supported_languages() -> list[str]:
    return sorted(STAGE2_TO_GRAMMAR)


@lru_cache(maxsize=None)
def get_language(key: str) -> tree_sitter.Language | None:
    """None when the grammar package is not installed or its ABI does not match the tree-sitter runtime."""
    module_name, loader = _GRAMMARS[key]
    try:
        module = importlib.import_module(module_name)
        return tree_sitter.Language(getattr(module, loader)())
    except (ImportError, AttributeError, ValueError):
        return None


def new_parser(key: str) -> tree_sitter.Parser | None:
    language = get_language(key)
    return tree_sitter.Parser(language) if language else None
