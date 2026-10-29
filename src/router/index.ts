import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: HomePage, meta: { title: 'home.title' } },
    {
      path: '/action-planner',
      component: () => import('../tools/action-planner/ActionPlannerPage.vue'),
      meta: { title: 'planner.title' },
    },
    {
      path: '/warp-simulator',
      component: () => import('../tools/warp-simulator/WarpSimulatorPage.vue'),
      meta: { title: 'warp.title' },
    },
    {
      path: '/currency-wars',
      component: () => import('../tools/currency-wars/CurrencyWarsPage.vue'),
      meta: { title: 'currencyWars.title' },
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('../views/NotFoundPage.vue'),
      meta: { title: 'missing.title' },
    },
  ],
})
