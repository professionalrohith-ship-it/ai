"""Extraction tests: source text in, structure out. No database or API involved."""
import pytest

from app.intelligence.parser import UnsupportedLanguage, is_supported, parse_source


def parse(code: str, language: str, ext: str):
    return parse_source(code.encode(), language, ext)


def by_name(result, name):
    matches = [s for s in result.symbols if s.name == name]
    assert matches, f"{name} not found in {[s.name for s in result.symbols]}"
    return matches[0]


# ---- Python ------------------------------------------------------------------------------------
PY = '''"""Module doc."""
import os, sys as system
from . import sibling
from ..pkg.mod import a, b as c
from x import *
__all__ = ["Foo", "helper"]
MAX_SIZE = 10
count: int = 0

class Foo(Base, metaclass=Meta):
    """Foo doc."""
    LIMIT = 3

    @property
    def name(self) -> str:
        return "x"

    def __init__(self, a: int, b=2, *args, **kw):
        self.a = a
        local = 1

    async def run(self):
        def inner():
            pass
        helper(1)
        self.go()

    class Meta:
        flag = True

@decorator(arg=1)
def helper(x, y: str = "a") -> None:
    """Help."""
    os.path.join("a")

def _private(): pass
'''


def test_python_structure():
    r = parse(PY, "Python", ".py")
    assert r.syntax_errors == 0 and r.module_docstring == "Module doc."
    foo = by_name(r, "Foo")
    assert foo.kind == "class" and foo.bases == ["Base"] and foo.docstring == "Foo doc." and foo.exported
    assert (foo.start_line, foo.end_line) == (10, 29)
    assert by_name(r, "name").kind == "method" and by_name(r, "name").decorators == ["property"]
    assert by_name(r, "name").return_type == "str" and by_name(r, "name").parent == "Foo"
    init = by_name(r, "__init__")
    assert init.kind == "constructor"
    assert [p["name"] for p in init.parameters] == ["self", "a", "b", "args", "kw"]
    assert init.parameters[1]["type"] == "int" and init.parameters[2]["default"] == "2"
    assert by_name(r, "run").signature.startswith("async run")
    helper = by_name(r, "helper")
    assert helper.kind == "function" and helper.decorators == ["decorator(arg=1)"] and helper.docstring == "Help."
    assert helper.return_type == "None" and helper.exported
    assert not by_name(r, "_private").exported  # __all__ lists only Foo and helper
    assert by_name(r, "MAX_SIZE").kind == "constant" and by_name(r, "count").kind == "variable"
    assert by_name(r, "count").return_type == "int"


def test_python_nested_structures_and_scopes():
    r = parse(PY, "Python", ".py")
    inner = by_name(r, "inner")
    assert inner.parent == "Foo.run" and inner.kind == "function"
    meta = [s for s in r.symbols if s.name == "Meta"][0]
    assert meta.parent == "Foo" and meta.qualified_name == "Foo.Meta"
    assert by_name(r, "flag").parent == "Foo.Meta"
    assert not [s for s in r.symbols if s.name == "local"]  # function-local variables are not symbols


def test_python_imports():
    r = parse(PY, "Python", ".py")
    imports = [(i.kind, i.module, tuple(i.names), i.alias, i.level) for i in r.imports]
    assert ("import", "os", (), None, 0) in imports
    assert ("import", "sys", (), "system", 0) in imports
    assert ("from", ".", ("sibling",), None, 1) in imports
    assert ("from", "..pkg.mod", ("a", "b"), None, 2) in imports
    assert ("from", "x", ("*",), None, 0) in imports


def test_python_calls_recorded_with_scope():
    r = parse(PY, "Python", ".py")
    calls = {(x.source, x.target) for x in r.relations if x.relation == "calls"}
    assert ("Foo.run", "helper") in calls and ("Foo.run", "go") in calls and ("helper", "join") in calls


# ---- TypeScript / JavaScript -------------------------------------------------------------------
TS = '''import fs, { readFile as rf } from 'fs';
import * as path from "path";
import type { T } from './types';
import './side';
export { a, b as c } from './x';
export * from './y';
const m = require('mod');
const lazy = () => import('./lazy');
/** Documented class. */
@Component({selector: 'x'})
export class Foo<T> extends Base<T> implements I1, I2 {
  @Input() name: string = 'a';
  constructor(private a: number) { super(); }
  async run(x: number, y?: string, ...rest: any[]): Promise<void> { this.go(x); }
}
export interface Shape extends Base { area(a: number): number; label: string }
export type U = string | number;
export enum E { A }
namespace N { export const k = 1; }
export const f = (a: number): number => a + 1;
export default function main() {}
function local() {}
export { local };
'''


def test_typescript_structure():
    r = parse(TS, "TypeScript", ".ts")
    assert r.syntax_errors == 0
    foo = by_name(r, "Foo")
    assert foo.kind == "class" and foo.bases == ["Base"] and foo.interfaces == ["I1", "I2"]
    assert foo.decorators == ["Component({selector: 'x'})"] and foo.docstring == "Documented class." and foo.exported
    run = by_name(r, "run")
    assert run.kind == "method" and run.parent == "Foo" and run.return_type == "Promise<void>"
    assert [p["name"] for p in run.parameters] == ["x", "y", "rest"]
    assert run.parameters[1]["optional"] is True and run.parameters[2]["variadic"] is True
    assert by_name(r, "constructor").kind == "constructor"
    assert by_name(r, "name").kind == "property" and by_name(r, "name").decorators == ["Input()"]
    shape = by_name(r, "Shape")
    assert shape.kind == "interface" and shape.bases == ["Base"]
    assert by_name(r, "area").parent == "Shape" and by_name(r, "area").kind == "method"
    assert by_name(r, "U").kind == "type_alias" and by_name(r, "E").kind == "enum"
    assert by_name(r, "N").kind == "namespace" and by_name(r, "k").parent == "N"
    f = by_name(r, "f")
    assert f.kind == "function" and f.return_type == "number" and f.exported
    assert by_name(r, "main").exported
    assert by_name(r, "local").exported  # via `export { local }`


def test_typescript_imports_and_exports():
    r = parse(TS, "TypeScript", ".ts")
    got = {(i.kind, i.module): i for i in r.imports}
    assert got[("import", "fs")].names == ["default", "readFile"]
    assert got[("import", "path")].names == ["*"] and got[("import", "path")].alias == "path"
    assert ("import_type", "./types") in got and ("import", "./side") in got
    assert got[("export_from", "./x")].names == ["a", "b"] and got[("export_from", "./y")].names == ["*"]
    assert ("require", "mod") in got and ("dynamic_import", "./lazy") in got


def test_tsx_uses_jsx_grammar():
    r = parse("export const Button = ({label}: {label: string}) => <button>{label}</button>;\n", "TypeScript", ".tsx")
    assert r.syntax_errors == 0 and by_name(r, "Button").kind == "function"


def test_javascript_class_and_commonjs():
    code = "const express = require('express');\nclass A extends B { m() {} }\nfunction f(a, b = 1) {}\nmodule.exports = A;\n"
    r = parse(code, "JavaScript", ".js")
    a = by_name(r, "A")
    assert a.bases == ["B"] and by_name(r, "m").kind == "method"
    assert [p["name"] for p in by_name(r, "f").parameters] == ["a", "b"]
    assert [(i.kind, i.module) for i in r.imports] == [("require", "express")]


# ---- Java --------------------------------------------------------------------------------------
JAVA = '''package com.x.y;
import java.util.List;
import static java.lang.Math.*;
/** Doc. */
@Entity
public class Foo extends Bar implements Baz, Qux {
  public static final int MAX = 1;
  private String name;
  @Override public <T> List<T> run(String a, int... b) throws Exception { foo.bar(1); return null; }
  public Foo(int x) {}
  static class Inner { void m() {} }
}
interface I extends J {}
enum E { A }
record R(int a) {}
'''


def test_java_structure():
    r = parse(JAVA, "Java", ".java")
    assert r.namespace == "com.x.y"
    foo = by_name(r, "Foo")
    assert foo.qualified_name == "com.x.y.Foo" and foo.bases == ["Bar"] and foo.interfaces == ["Baz", "Qux"]
    assert foo.decorators == ["Entity"] and foo.docstring == "Doc." and foo.exported
    assert by_name(r, "MAX").kind == "constant" and by_name(r, "name").kind == "variable"
    run = by_name(r, "run")
    assert run.kind == "method" and run.return_type == "List<T>" and run.decorators == ["Override"]
    assert [p["name"] for p in run.parameters] == ["a", "b"] and run.parameters[1]["variadic"]
    assert [s for s in r.symbols if s.kind == "constructor"][0].name == "Foo"
    inner = by_name(r, "Inner")
    assert inner.parent == "Foo" and by_name(r, "m").parent == "Foo.Inner"
    assert by_name(r, "I").kind == "interface" and by_name(r, "I").bases == ["J"]
    assert by_name(r, "E").kind == "enum" and by_name(r, "R").kind == "record"
    assert {(i.kind, i.module, tuple(i.names)) for i in r.imports} == {
        ("import", "java.util.List", ()), ("import_static", "java.lang.Math", ("*",))}


# ---- C# ----------------------------------------------------------------------------------------
CS = '''using System;
using static System.Math;
using A = Foo.Bar;
namespace My.App {
  [Serializable]
  public class Foo<T> : Base, IThing {
    private const int MAX = 3;
    public int Count { get; set; }
    public Foo(int x) {}
    public async Task<int> Run(string a, int b = 2) { Console.WriteLine(a); return 1; }
  }
  public interface IThing {}
}
'''


def test_csharp_structure():
    r = parse(CS, "C#", ".cs")
    assert r.namespace == "My.App"
    foo = by_name(r, "Foo")
    assert foo.qualified_name == "My.App.Foo" and foo.bases == ["Base"] and foo.interfaces == ["IThing"]
    assert foo.decorators == ["Serializable"]
    assert by_name(r, "MAX").kind == "constant" and by_name(r, "Count").kind == "property"
    run = by_name(r, "Run")
    assert run.kind == "method" and run.return_type == "Task<int>" and run.parameters[1]["name"] == "b"
    assert by_name(r, "IThing").kind == "interface"
    imports = {(i.kind, i.module, i.alias) for i in r.imports}
    assert imports == {("using", "System", None), ("import_static", "System.Math", None), ("using", "Foo.Bar", "A")}


# ---- Go ----------------------------------------------------------------------------------------
GO = '''package main

import (
	"fmt"
	str "strings"
)

// T is a thing.
type T struct {
	A int
	Base
}

type I interface {
	M() int
	Other
}

type Alias = int

const X = 1

var Y, Z int

func (t *T) Method(a int, b ...string) (int, error) { fmt.Println(a); return 1, nil }

func Free() {}
func hidden() {}
'''


def test_go_structure():
    r = parse(GO, "Go", ".go")
    assert r.syntax_errors == 0 and r.namespace == "main"
    t = by_name(r, "T")
    assert t.kind == "struct" and t.bases == ["Base"] and t.docstring == "T is a thing." and t.exported
    assert by_name(r, "I").kind == "interface" and by_name(r, "I").bases == ["Other"]
    method = by_name(r, "Method")
    assert method.kind == "method" and method.parent == "T" and method.return_type == "(int, error)"
    assert method.parameters[1]["variadic"] is True
    assert by_name(r, "Free").exported and not by_name(r, "hidden").exported
    assert by_name(r, "X").kind == "constant" and by_name(r, "Y").kind == "variable" and by_name(r, "Z").kind == "variable"
    assert {(i.module, i.alias) for i in r.imports} == {("fmt", None), ("strings", "str")}


# ---- Rust --------------------------------------------------------------------------------------
RUST = '''use std::collections::{HashMap, HashSet};
use crate::util::helper as h;
mod inner;
/// Documented.
#[derive(Debug, Clone)]
pub struct S { pub a: i32 }
pub trait T: Super { fn m(&self) -> i32; }
impl T for S { fn m(&self) -> i32 { helper(1); self.x(); 1 } }
impl S { pub fn new(a: i32) -> Self { S { a } } }
const MAX: i32 = 1;
'''


def test_rust_structure():
    r = parse(RUST, "Rust", ".rs")
    s = by_name(r, "S")
    assert s.kind == "struct" and s.exported and s.decorators == ["derive(Debug, Clone)"] and s.docstring == "Documented."
    assert s.interfaces == ["T"]
    assert by_name(r, "T").kind == "trait" and by_name(r, "T").bases == ["Super"]
    assert [x.parent for x in r.symbols if x.name == "m"] == ["T", "S"]
    assert by_name(r, "new").parent == "S" and by_name(r, "MAX").kind == "constant"
    assert any(x.relation == "implements" and x.source == "S" and x.target == "T" for x in r.relations)
    assert {(i.kind, i.module, i.alias) for i in r.imports} == {
        ("use", "std::collections::HashMap", None), ("use", "std::collections::HashSet", None),
        ("use", "crate::util::helper", "h"), ("mod", "inner", None)}


# ---- C / C++ -----------------------------------------------------------------------------------
CPP = '''#include <vector>
#include "util.h"
#define MAX 3
namespace ns {
class Foo : public Base, private Other {
 public:
  Foo(int x);
  int run(int a, const std::string& b) const { helper(a); return a; }
};
}
int Foo::go(int z) { return z; }
static const int K = 1;
int main(int argc, char** argv) { return 0; }
typedef struct { int a; } Pt;
struct Node { int v; };
'''


def test_cpp_structure():
    r = parse(CPP, "C++", ".cpp")
    foo = by_name(r, "Foo")
    assert foo.kind == "class" and foo.bases == ["Base", "Other"] and foo.qualified_name == "ns.Foo"
    assert [s.kind for s in r.symbols if s.name == "Foo"] == ["class", "constructor"]
    assert by_name(r, "run").kind == "method" and by_name(r, "run").parent == "ns.Foo"
    assert by_name(r, "go").parent == "Foo"  # out-of-class definition keeps the owner written in the source
    assert by_name(r, "main").return_type == "int" and by_name(r, "K").kind == "constant"
    assert by_name(r, "Pt").kind == "type_alias" and by_name(r, "MAX").kind == "macro"
    assert {(i.kind, i.module) for i in r.imports} == {("include_system", "vector"), ("include", "util.h")}


def test_c_prototypes_and_globals():
    r = parse("#include <stdio.h>\nint add(int a, int b);\nint counter = 0;\nint add(int a, int b) { return a + b; }\n", "C", ".c")
    kinds = [(s.name, s.kind) for s in r.symbols]
    assert kinds.count(("add", "function")) == 2 and ("counter", "variable") in kinds


# ---- PHP / Ruby --------------------------------------------------------------------------------
PHP = '''<?php
namespace App\\Models;
use App\\Base\\Model as M;
use Foo\\Bar;
require_once 'util.php';
#[Entity]
class User extends M implements A, B {
  use Trait1;
  const X = 1;
  public int $id = 0;
  public function run(int $a, ?string $b = null): bool { helper($a); $this->go(); return true; }
}
function free() {}
'''


def test_php_structure():
    r = parse(PHP, "PHP", ".php")
    assert r.namespace == "App.Models"
    user = by_name(r, "User")
    assert user.qualified_name == "App.Models.User" and user.bases == ["M"] and user.interfaces == ["A", "B"]
    assert user.decorators == ["Entity"]
    assert by_name(r, "X").kind == "constant" and by_name(r, "id").kind == "property"
    run = by_name(r, "run")
    assert run.kind == "method" and run.return_type == "bool" and [p["name"] for p in run.parameters] == ["a", "b"]
    assert by_name(r, "free").kind == "function"
    assert any(x.relation == "uses" and x.target == "Trait1" for x in r.relations)
    assert {(i.kind, i.module, i.alias) for i in r.imports} == {
        ("use", "App\\Base\\Model", "M"), ("use", "Foo\\Bar", None), ("require", "util.php", None)}


RUBY = '''require 'json'
require_relative 'lib/x'
# Doc
class Foo < Bar
  include Mixin
  MAX = 1
  def run(a, b = 1, *rest, key: 2)
    helper(a)
  end
  def self.build; end
end
module M; end
'''


def test_ruby_structure():
    r = parse(RUBY, "Ruby", ".rb")
    foo = by_name(r, "Foo")
    assert foo.bases == ["Bar"] and foo.docstring == "Doc"
    assert by_name(r, "MAX").kind == "constant" and by_name(r, "M").kind == "namespace"
    assert [p["name"] for p in by_name(r, "run").parameters] == ["a", "b", "rest", "key"]
    assert by_name(r, "build").parent == "Foo"
    assert any(x.relation == "includes" and x.target == "Mixin" for x in r.relations)
    assert {(i.kind, i.module) for i in r.imports} == {("require", "json"), ("require_relative", "lib/x")}


# ---- robustness --------------------------------------------------------------------------------
def test_syntax_errors_still_yield_valid_parts():
    r = parse("def good():\n    pass\n\ndef broken(:\n    pass\n\nclass Fine:\n    pass\n", "Python", ".py")
    assert r.syntax_errors >= 1 and r.first_error_line == 4
    assert {"good", "Fine"} <= {s.name for s in r.symbols}


@pytest.mark.parametrize(
    "language,ext,code",
    [("Python", ".py", "class A(:\n  def"), ("TypeScript", ".ts", "export class {{{ function (("),
     ("Java", ".java", "public class X { void m( }"), ("Go", ".go", "func (("), ("Rust", ".rs", "fn main( {"),
     ("C", ".c", "int main( {"), ("C#", ".cs", "class A { void"), ("PHP", ".php", "<?php class {"),
     ("Ruby", ".rb", "class\n def (")],
)
def test_incomplete_sources_never_crash(language, ext, code):
    r = parse(code, language, ext)
    assert r.syntax_errors >= 1


def test_empty_and_whitespace_files():
    for text in ("", "\n\n   \n"):
        r = parse(text, "Python", ".py")
        assert r.symbols == [] and r.syntax_errors == 0


def test_non_utf8_bytes_do_not_crash():
    r = parse_source(b"def f():\n    return '\xff\xfe'\n# \x80\n", "Python", ".py")
    assert by_name(r, "f").kind == "function"


def test_deeply_nested_source_does_not_hit_recursion_limit():
    depth = 1500
    code = "x = " + "[" * depth + "1" + "]" * depth + "\nclass After:\n    pass\n"
    r = parse(code, "Python", ".py")
    assert by_name(r, "After").kind == "class"


def test_unicode_identifiers():
    r = parse("class Größe:\n    def método(self): pass\n", "Python", ".py")
    assert by_name(r, "Größe").kind == "class" and by_name(r, "método").parent == "Größe"


def test_unsupported_languages():
    for language, ext in (("HTML", ".html"), ("CSS", ".css"), ("SQL", ".sql"), ("Kotlin", ".kt"), (None, ".xyz")):
        assert not is_supported(language, ext)
        with pytest.raises(UnsupportedLanguage):
            parse_source(b"x", language, ext)


def test_supported_matrix():
    for language, ext in (("Python", ".py"), ("JavaScript", ".js"), ("TypeScript", ".ts"), ("TypeScript", ".tsx"),
                          ("Java", ".java"), ("C", ".c"), ("C++", ".cpp"), ("C#", ".cs"), ("Go", ".go"),
                          ("Rust", ".rs"), ("PHP", ".php"), ("Ruby", ".rb")):
        assert is_supported(language, ext), language
