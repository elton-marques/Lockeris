import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['apps/api/test/**/*.test.ts','apps/web/src/**/*.test.ts','scripts/portable/**/*.test.mjs'],fileParallelism:false}});
