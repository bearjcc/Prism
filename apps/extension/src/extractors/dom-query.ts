export function querySelectorAllDeep(
  root: ParentNode,
  selector: string,
): Element[] {
  const matches = new Set<Element>();
  const visited = new Set<ParentNode>();
  const stack: ParentNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || visited.has(node)) {
      continue;
    }
    visited.add(node);

    try {
      for (const match of querySelectorAllOnNode(node, selector)) {
        matches.add(match);
      }

      const shadowRoot = shadowRootOf(node);
      if (shadowRoot !== undefined) {
        stack.push(shadowRoot);
      }
      for (const child of childNodesOf(node)) {
        stack.push(child);
      }
    } catch {
      // Live hosts can reject traversal while custom elements upgrade.
    }
  }

  return [...matches];
}

export function querySelectorDeep(
  root: ParentNode,
  selector: string,
): Element | undefined {
  return querySelectorAllDeep(root, selector)[0];
}

function querySelectorAllOnNode(
  node: ParentNode,
  selector: string,
): Element[] {
  const query = (
    node as ParentNode & {
      querySelectorAll?: (value: string) => NodeListOf<Element>;
    }
  ).querySelectorAll;
  if (typeof query !== "function") {
    return [];
  }
  return Array.from(query.call(node, selector));
}

function shadowRootOf(node: ParentNode): ParentNode | undefined {
  if (!("shadowRoot" in node)) {
    return undefined;
  }
  const shadowRoot = (node as Element).shadowRoot;
  return shadowRoot ?? undefined;
}

function childNodesOf(node: ParentNode): Element[] {
  if (!("children" in node) || node.children === undefined) {
    return [];
  }
  return Array.from(node.children);
}
