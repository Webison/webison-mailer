export const MESSAGE_HEIGHT = 82
export const GROUP_HEIGHT = 28
export function flattenGroups(groups) {
  let offset = 0
  const rows = []
  for (const group of groups) {
    rows.push({ key: `group-${group.key}`, label: group.label, top: offset, height: GROUP_HEIGHT })
    offset += GROUP_HEIGHT
    for (const message of group.items) {
      rows.push({ key: String(message.uid), message, top: offset, height: MESSAGE_HEIGHT })
      offset += MESSAGE_HEIGHT
    }
  }
  return { rows, height: offset }
}
export function visibleRows(rows, scrollTop, viewportHeight) {
  return rows.filter(row => row.top + row.height >= scrollTop - 3 * MESSAGE_HEIGHT && row.top <= scrollTop + viewportHeight + 3 * MESSAGE_HEIGHT)
}
