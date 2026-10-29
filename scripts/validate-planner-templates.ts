import { plannerTemplates } from '../src/tools/action-planner/templates/catalog'
import { validatePlannerTemplates } from '../src/tools/action-planner/templates/loader'
import zh from '../src/locales/zh-CN.json'
import en from '../src/locales/en.json'

console.log(
  `Planner templates: ${validatePlannerTemplates(plannerTemplates, [zh, en])} reviewed files validated.`,
)
