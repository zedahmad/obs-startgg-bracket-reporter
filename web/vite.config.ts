import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      "/api/draft": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/fonts": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/assets": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
	  "^/(matches|streams|assign|unassign|start|updateScoreLocal|updateScoreDelta|resetScore|offline|saveResult|submitFinal|refresh|config|app-state|settings|streamdeck|draft.)": {
		target: 'http://127.0.0.1:3001',
		changeOrigin: true
	  },
      "/socket.io": {
        target: "http://127.0.0.1:3001",
		changeOrigin:true, 
        ws: true,
      },
    },
  },
});
