/**
 * DAB-API — Production Build
 * Produces a single fully self-contained CJS bundle at dist/index.js.
 * Every dependency is inlined — no node_modules required at runtime.
 *
 * Usage:
 *   node build.js             → production  (minified, no sourcemap)
 *   node build.js --dev       → development (readable, inline sourcemap)
 *   node build.js --watch     → watch mode  (rebuilds on file change)
 *   node build.js --analyze   → production  + per-module size report
 */

'use strict';

const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const isDev   = args.includes('--dev');
const isWatch = args.includes('--watch');
const analyze = args.includes('--analyze');

// ─── Package metadata ─────────────────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// ─── Banner ───────────────────────────────────────────────────────────────────
const banner = [
    '/**',
    ` * ${pkg.name} v${pkg.version}`,
    ' * Low-Code API Platform — Configuration-driven REST API generator',
    ` * Build date : ${new Date().toISOString()}`,
    ' * Node target: node20',
    ' */',
].join('\n');

// ─── Shared esbuild options ───────────────────────────────────────────────────
const sharedOptions = {
    entryPoints : ['./src/index.js'],
    outfile     : './dynamic-api-builder-js/dist/index.js',

    bundle      : true,   // inline every dependency
    platform    : 'node',
    target      : 'node20',
    format      : 'cjs',

    // No externals — everything is bundled in
    external    : [],

    define: {
        'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    },

    loader: {
        '.json': 'json',  // inline any require()'d JSON files
    },

    banner   : { js: banner },
    metafile : analyze,
    logLevel : 'info',
};

// ─── Mode overrides ───────────────────────────────────────────────────────────
// Keep production output readable by disabling minification.
const modeOptions = isDev
    ? { minify: false, sourcemap: 'inline', treeShaking: false }
    : { minify: false, sourcemap: false,    treeShaking: true, legalComments: 'none' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanDist() {
    const distDir = path.join(__dirname, 'dynamic-api-builder-js/dist');
    const indexFile = path.join(distDir, 'index.js');

    fs.mkdirSync(distDir, { recursive: true });

    if (fs.existsSync(indexFile)) {
        fs.rmSync(indexFile, { force: true });
    }

    console.log('🗑️  DAB Build: dynamic-api-builder-js/dist/index.js cleaned');
}

async function writeAnalysis(metafile) {
    const text = await esbuild.analyzeMetafile(metafile, { verbose: true });
    fs.writeFileSync(
        path.join(__dirname, 'dynamic-api-builder-js/dist', 'meta.json'),
        JSON.stringify(metafile, null, 2)
    );
    console.log('\n📊 DAB Build: Bundle analysis\n');
    console.log(text);
    console.log('📄 DAB Build: Full metafile written to dynamic-api-builder-js/dist/meta.json');
}

function printStats() {
    const outfile = path.join(__dirname, 'dynamic-api-builder-js/dist', 'index.js');
    if (!fs.existsSync(outfile)) return;
    const kb = (fs.statSync(outfile).size / 1024).toFixed(1);
    console.log(`📦 DAB Build: dynamic-api-builder-js/dist/index.js → ${kb} KB  (fully self-contained)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    cleanDist();

    const buildOptions = { ...sharedOptions, ...modeOptions };

    // ── Watch mode ────────────────────────────────────────────────────────────
    if (isWatch) {
        console.log('👀 DAB Build: Starting watch mode…');
        buildOptions.minify    = false;
        buildOptions.sourcemap = 'inline';

        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();

        process.on('SIGINT', async () => {
            await ctx.dispose();
            console.log('\n⏹  DAB Build: Watch stopped');
            process.exit(0);
        });
        return;
    }

    // ── Single build ──────────────────────────────────────────────────────────
    const mode = isDev ? 'development' : 'production';
    console.log(`🔨 DAB Build: Building in ${mode} mode…`);

    try {
        const result = await esbuild.build(buildOptions);

        printStats();

        if (analyze && result.metafile) {
            await writeAnalysis(result.metafile);
        }

        if (result.errors.length > 0) {
            console.error('❌ DAB Build: Completed with errors');
            process.exit(1);
        }

        console.log(`✅ DAB Build: ${mode} bundle ready → dynamic-api-builder-js/dist/index.js`);
    } catch (err) {
        console.error('❌ DAB Build failed:', err.message);
        process.exit(1);
    }
})();
