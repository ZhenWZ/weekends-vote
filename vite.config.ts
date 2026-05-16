import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const explicitBase = process.env.VITE_BASE_PATH;

export default defineConfig({
  plugins: [react()],
  base: explicitBase ?? (process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/'),
});
