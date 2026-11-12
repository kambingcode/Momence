/**
 * Aturan lapisan Clean Architecture (lihat TASKS.md → "Arsitektur").
 * presentation (app, features, components, remotion) → application → domain
 * infrastructure → application/domain; wiring hanya di src/server/container.ts
 */
const TEST_FILE = "\\.test\\.tsx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      comment:
        "Domain hanya boleh import domain modulnya sendiri: tanpa framework, paket npm, modul Node (fs, path, …), atau lapisan lain.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/domain/", pathNot: TEST_FILE },
      to: { pathNot: "^src/modules/$1/domain/" },
    },
    {
      name: "application-depends-inward",
      comment:
        "Application hanya boleh import domain/application modulnya, API publik modul lain (application/index.ts), dan src/shared. Tanpa SDK, framework, atau modul Node.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/application/", pathNot: TEST_FILE },
      to: {
        pathNot: [
          "^src/modules/$1/(domain|application)/",
          "^src/modules/[^/]+/application/index\\.ts$",
          "^src/shared/",
        ],
      },
    },
    {
      name: "infrastructure-not-outward",
      comment:
        "Adapter tidak boleh bergantung pada presentation atau composition root.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/infrastructure/" },
      to: {
        path: [
          "^src/(app|features|components|remotion)/",
          "^src/server/container\\.ts$",
        ],
      },
    },
    {
      name: "modules-via-public-api",
      comment:
        "Modul lain hanya diakses lewat application/index.ts-nya, bukan file internal.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/(?!$1/)[^/]+/",
        pathNot: "^src/modules/[^/]+/application/index\\.ts$",
      },
    },
    {
      name: "presentation-no-internals",
      comment:
        "Presentation memanggil use case lewat container / application/index.ts; tidak boleh menyentuh adapter.",
      severity: "error",
      from: { path: "^src/(app|features|components|remotion|lib)/" },
      to: {
        path: [
          "^src/modules/[^/]+/infrastructure/",
          "^src/modules/[^/]+/application/(?!index\\.ts$)",
        ],
      },
    },
    {
      name: "client-ui-no-server",
      comment: "Komponen UI tidak boleh import kode server.",
      severity: "error",
      from: { path: "^src/(features|components|lib)/" },
      to: { path: "^src/server/" },
    },
    {
      name: "shared-is-leaf",
      comment: "src/shared hanya berisi skema & util tanpa I/O.",
      severity: "error",
      from: { path: "^src/shared/" },
      to: {
        path: ["^src/(modules|server|app|features|components|remotion|lib)/"],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
