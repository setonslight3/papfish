import { isMoveOfColor } from './position.js';
import type { Color, RepertoireNodeRecord } from './types.js';

export interface RepertoireTreeNode extends RepertoireNodeRecord {
  children: RepertoireTreeNode[];
}

export interface RepertoireTree {
  roots: RepertoireTreeNode[];
  byId: Map<string, RepertoireTreeNode>;
  /** parent id ("" for roots) -> children */
  byParent: Map<string, RepertoireTreeNode[]>;
}

/**
 * Build a branching tree from flat node rows.
 *
 * Repertoires are stored as parent-linked nodes, never as a flat list of lines,
 * so an arbitrary number of alternatives can hang off any position.
 */
export function buildTree(nodes: RepertoireNodeRecord[]): RepertoireTree {
  const byId = new Map<string, RepertoireTreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }

  const byParent = new Map<string, RepertoireTreeNode[]>();
  const roots: RepertoireTreeNode[] = [];

  for (const node of byId.values()) {
    const parentKey = node.parentNodeId ?? '';
    const siblings = byParent.get(parentKey) ?? [];
    siblings.push(node);
    byParent.set(parentKey, siblings);

    if (node.parentNodeId === null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentNodeId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan (parent deleted): treat as a root so nothing disappears silently.
        roots.push(node);
      }
    }
  }

  const sortNodes = (list: RepertoireTreeNode[]) =>
    list.sort((a, b) => a.ply - b.ply || a.moveSan.localeCompare(b.moveSan));

  sortNodes(roots);
  for (const list of byParent.values()) sortNodes(list);
  for (const node of byId.values()) sortNodes(node.children);

  return { roots, byId, byParent };
}

export function childrenOf(tree: RepertoireTree, parentId: string | null): RepertoireTreeNode[] {
  return tree.byParent.get(parentId ?? '') ?? [];
}

export function findChildBySan(
  tree: RepertoireTree,
  parentId: string | null,
  san: string,
): RepertoireTreeNode | null {
  return childrenOf(tree, parentId).find((node) => node.moveSan === san) ?? null;
}

/** Follow a SAN path from the root, returning the nodes matched (may be partial). */
export function walkPath(tree: RepertoireTree, sanPath: string[]): RepertoireTreeNode[] {
  const nodes: RepertoireTreeNode[] = [];
  let parentId: string | null = null;
  for (const san of sanPath) {
    const child: RepertoireTreeNode | null = findChildBySan(tree, parentId, san);
    if (!child) break;
    nodes.push(child);
    parentId = child.id;
  }
  return nodes;
}

export function pathToRoot(tree: RepertoireTree, nodeId: string): RepertoireTreeNode[] {
  const path: RepertoireTreeNode[] = [];
  let current = tree.byId.get(nodeId) ?? null;
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentNodeId ? (tree.byId.get(current.parentNodeId) ?? null) : null;
  }
  return path;
}

export function sanPathTo(tree: RepertoireTree, nodeId: string): string[] {
  return pathToRoot(tree, nodeId).map((node) => node.moveSan);
}

/** Every node in depth-first order. */
export function flatten(tree: RepertoireTree): RepertoireTreeNode[] {
  const out: RepertoireTreeNode[] = [];
  const visit = (node: RepertoireTreeNode) => {
    out.push(node);
    node.children.forEach(visit);
  };
  tree.roots.forEach(visit);
  return out;
}

/**
 * Nodes that represent a decision by the repertoire owner - these are the
 * positions training asks about.
 */
export function trainableNodes(tree: RepertoireTree, color: Color): RepertoireTreeNode[] {
  return flatten(tree).filter(
    (node) => node.isUserMove && isMoveOfColor(node.ply, color),
  );
}

/** Distinct leaf lines, useful for showing a repertoire's coverage. */
export function lines(tree: RepertoireTree): RepertoireTreeNode[][] {
  const out: RepertoireTreeNode[][] = [];
  const visit = (node: RepertoireTreeNode, prefix: RepertoireTreeNode[]) => {
    const path = [...prefix, node];
    if (node.children.length === 0) {
      out.push(path);
      return;
    }
    node.children.forEach((child) => visit(child, path));
  };
  tree.roots.forEach((root) => visit(root, []));
  return out;
}

export interface RepertoireSummary {
  nodeCount: number;
  trainableCount: number;
  lineCount: number;
  maxDepth: number;
}

export function summarize(tree: RepertoireTree, color: Color): RepertoireSummary {
  const all = flatten(tree);
  return {
    nodeCount: all.length,
    trainableCount: trainableNodes(tree, color).length,
    lineCount: lines(tree).length,
    maxDepth: all.reduce((max, node) => Math.max(max, node.ply), 0),
  };
}
