"""NetworkX dependency graph built from the stored imports. Pure read-side analysis: no files are opened."""
from __future__ import annotations

import networkx as nx

from ..db import Database
from ..errors import ApiError

TOP = 10
MAX_CYCLE_GROUPS = 20
MAX_CYCLE_MEMBERS = 30
MAX_LIST = 200
CYCLE_NOTE = (
    "Cycles are based on every static import between repository files, including type-only and lazy imports, "
    "which are often harmless. Re-exports through index/__init__ files commonly create cycles too."
)


def build_graph(db: Database, repo_id: str) -> nx.DiGraph:
    """Directed graph: file nodes (type='file'), edge a->b when a imports b. External packages are separate
    nodes ('pkg:<name>', type='external') so they never mix into file-level statistics."""
    graph = nx.DiGraph()
    with db.session() as conn:
        for row in conn.execute(
            "SELECT path, language, status FROM code_files WHERE repository_id=?", (repo_id,)
        ):
            graph.add_node(row["path"], type="file", language=row["language"], status=row["status"])
        for row in conn.execute(
            "SELECT path, resolved_path, COUNT(*) AS n FROM imports WHERE repository_id=? AND dep_type='internal'"
            " AND resolved_path IS NOT NULL AND resolved_path!=path GROUP BY path, resolved_path", (repo_id,)
        ):
            if row["resolved_path"] in graph and row["path"] in graph:
                graph.add_edge(row["path"], row["resolved_path"], imports=row["n"], kind="internal")
        for row in conn.execute(
            "SELECT path, package, COUNT(*) AS n FROM imports WHERE repository_id=? AND dep_type='external'"
            " AND package IS NOT NULL GROUP BY path, package", (repo_id,)
        ):
            if row["path"] in graph:
                node = f"pkg:{row['package']}"
                graph.add_node(node, type="external", label=row["package"])
                graph.add_edge(row["path"], node, imports=row["n"], kind="external")
    return graph


def _file_subgraph(graph: nx.DiGraph) -> nx.DiGraph:
    files = [n for n, d in graph.nodes(data=True) if d.get("type") == "file"]
    return graph.subgraph(files)


def circular_dependencies(files: nx.DiGraph) -> list[dict]:
    groups = []
    for component in sorted((c for c in nx.strongly_connected_components(files) if len(c) > 1), key=lambda c: (-len(c), min(c))):
        sub = files.subgraph(component)
        try:
            cycle = [edge[0] for edge in nx.find_cycle(sub)]
        except nx.NetworkXNoCycle:  # cannot happen for an SCC > 1, kept as a guard
            cycle = []
        members = sorted(component)
        groups.append({
            "size": len(members),
            "files": members[:MAX_CYCLE_MEMBERS],
            "truncated": len(members) > MAX_CYCLE_MEMBERS,
            "example_cycle": cycle + cycle[:1] if cycle else [],
        })
        if len(groups) >= MAX_CYCLE_GROUPS:
            break
    return groups


def graph_stats(db: Database, repo_id: str) -> dict:
    graph = build_graph(db, repo_id)
    files = _file_subgraph(graph)
    packages = [n for n, d in graph.nodes(data=True) if d.get("type") == "external"]
    file_count = files.number_of_nodes()
    edge_count = files.number_of_edges()

    def ranked(degree_view, limit=TOP):
        rows = sorted(degree_view, key=lambda kv: (-kv[1], kv[0]))
        return [(n, d) for n, d in rows if d > 0][:limit]

    in_deg, out_deg = dict(files.in_degree()), dict(files.out_degree())
    important = []
    for node, fan_in in ranked(files.in_degree()):
        important.append({
            "path": node, "language": files.nodes[node].get("language"), "fan_in": fan_in, "fan_out": out_deg[node],
            "transitive_dependents": len(nx.ancestors(files, node)),
        })
    heavy = [{"path": n, "language": files.nodes[n].get("language"), "fan_out": d, "fan_in": in_deg[n]}
             for n, d in ranked(files.out_degree())]
    packages_ranked = sorted(
        ({"package": graph.nodes[p]["label"], "files": graph.in_degree(p)} for p in packages),
        key=lambda x: (-x["files"], x["package"]),
    )
    components = sorted((len(c) for c in nx.weakly_connected_components(files)), reverse=True)
    cycles = circular_dependencies(files)
    isolated = sorted(n for n in files if in_deg[n] == 0 and out_deg[n] == 0 and graph.out_degree(n) == 0)
    return {
        "files": file_count,
        "internal_edges": edge_count,
        "external_packages": len(packages),
        "density": round(nx.density(files), 4) if file_count > 1 else 0.0,
        "average_fan_out": round(edge_count / file_count, 2) if file_count else 0.0,
        "is_acyclic": not cycles,
        "connected_components": len(components),
        "largest_component": components[0] if components else 0,
        "isolated_files": len(isolated),
        "isolated_examples": isolated[:20],
        "important_modules": important,
        "heaviest_importers": heavy,
        "top_external_packages": packages_ranked[:TOP],
        "circular_dependencies": cycles,
        "cycle_note": CYCLE_NOTE,
        "entry_candidates": sorted(
            n for n in files if in_deg[n] == 0 and out_deg[n] > 0
        )[:20],
    }


def file_relations(db: Database, repo_id: str, path: str) -> dict:
    graph = build_graph(db, repo_id)
    if path not in graph or graph.nodes[path].get("type") != "file":
        raise ApiError(404, "file_not_parsed", "This file is not in the dependency graph (parse the repository first).")
    files = _file_subgraph(graph)
    direct_imports = sorted(files.successors(path))
    direct_importers = sorted(files.predecessors(path))
    packages = sorted(graph.nodes[n]["label"] for n in graph.successors(path) if graph.nodes[n].get("type") == "external")
    descendants = sorted(nx.descendants(files, path))
    ancestors = sorted(nx.ancestors(files, path))
    cycle_members: list[str] = []
    for component in nx.strongly_connected_components(files):
        if path in component and len(component) > 1:
            cycle_members = sorted(component - {path})[:MAX_CYCLE_MEMBERS]
    return {
        "path": path,
        "language": graph.nodes[path].get("language"),
        "imports": direct_imports,
        "imported_by": direct_importers,
        "external_packages": packages,
        "transitive_dependencies": len(descendants),
        "transitive_dependents": len(ancestors),
        "transitive_dependency_files": descendants[:MAX_LIST],
        "transitive_dependent_files": ancestors[:MAX_LIST],
        "in_cycle": bool(cycle_members),
        "cycle_with": cycle_members,
    }
