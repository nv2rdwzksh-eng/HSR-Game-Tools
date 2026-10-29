/** Historical tests assert ordinary-node fields; fail if a system node slips into their result. */
export function ordinaryNode<T extends { kind: string }>(
  node: T,
): Exclude<T, { kind: 'cycleBoundary' }>
export function ordinaryNode<T extends { kind: string }>(
  node: T | undefined,
): Exclude<T, { kind: 'cycleBoundary' }> | undefined
export function ordinaryNode(node: { kind: string } | undefined) {
  if (node?.kind === 'cycleBoundary') throw new Error('Expected an ordinary participant node')
  return node
}
