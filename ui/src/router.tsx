/**
 * Navigation — bewusst im **Code-Modus**.
 *
 * Warum nicht dateibasiert: Der dateibasierte Modus braucht das Vite-Plugin und
 * legt eine generierte `routeTree.gen.ts` ins Repository. Für eine Desktop-App
 * mit fünf Ansichten ist das mehr Bauschritt als Nutzen.
 *
 * Warum `createHashHistory`: Die App wird vom eigenen Server ausgeliefert,
 * normale History würde also funktionieren. Mit Hash kann aber kein Serverpfad
 * je ins Leere zeigen — auch nicht im gebündelten `--include`-Fall oder wenn
 * jemand F5 auf einer Unterseite drückt.
 */
import { createHashHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { TaskQuery } from "../../shared/schema.ts";
import { RootLayout } from "./App.tsx";
import { TodayRoute } from "./routes/today.tsx";
import { BoardRoute } from "./routes/board.tsx";
import { TasksRoute } from "./routes/tasks.tsx";
import { ProjectsRoute } from "./routes/projects.tsx";
import { SettingsRoute } from "./routes/settings.tsx";

const rootRoute = createRootRoute({ component: RootLayout });

/**
 * Der eigentliche Gewinn: Suchparameter sind ein **validiertes Zod-Schema**.
 * `?status=quatsch` landet nie in der Komponente, und `search.status` ist im
 * ganzen Baum typisiert — dasselbe Schema, das die API validiert.
 */
const validateSearch = (search: Record<string, unknown>) => TaskQuery.parse(search);

/**
 * Die Tagesansicht hat selbst keine Filter, trägt das Schema aber mit: So kann
 * jeder Link und jeder Menüeintrag dieselben Suchparameter mitgeben, ohne zu
 * wissen, wohin er springt.
 */
const todayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch,
  component: TodayRoute,
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/board",
  validateSearch,
  component: BoardRoute,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/aufgaben",
  validateSearch,
  component: TasksRoute,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projekte",
  component: ProjectsRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/einstellungen",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  todayRoute,
  boardRoute,
  tasksRoute,
  projectsRoute,
  settingsRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
