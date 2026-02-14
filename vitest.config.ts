import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue2'
import path from 'path'

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: 'happy-dom',
        include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/util/mesh/**', 'src/util/slicer/**'],
        },
        setupFiles: ['./tests/setup.ts'],
        deps: {
            optimizer: {
                web: {
                    include: ['three'],
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
