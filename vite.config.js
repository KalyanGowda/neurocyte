import { defineConfig } from "vite"
import frontendConfig from "./frontend/vite.config.js"

export default defineConfig(async (env) => {
  const resolved =
    typeof frontendConfig === "function"
      ? await frontendConfig(env)
      : frontendConfig

  return {
    ...resolved,
    root: "frontend",
  }
})
