import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 3000 is the origin both backend services allow through CORS by default.
export default defineConfig({ plugins: [react()], server: { port: 3000, strictPort: true } });
