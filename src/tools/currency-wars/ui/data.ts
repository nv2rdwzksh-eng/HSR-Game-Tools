import rawSnapshot from '../../../../data/currency-wars/snapshot.json'
import rawTasks from '../../../../data/currency-wars/tasks.json'
import rawVisuals from '../../../../data/currency-wars/visuals.json'
import rawCrafts from '../../../../data/currency-wars/crafts.json'
import { assertSnapshot, parseTasks } from '../validation'
import { assertVisualCatalog } from './visuals'
import { assertCraftCatalog } from './crafting'

export function loadPageData() {
  assertSnapshot(rawSnapshot)
  const tasks = parseTasks(rawTasks, rawSnapshot)
  assertVisualCatalog(rawVisuals, rawSnapshot)
  assertCraftCatalog(rawCrafts, rawSnapshot)
  return { snapshot: rawSnapshot, tasks, visuals: rawVisuals, crafts: rawCrafts }
}
