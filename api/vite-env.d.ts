// Provides the `import.meta.env` shape required by src/constants.ts
// when compiled under the API's tsconfig (which lacks vite/client types).
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
