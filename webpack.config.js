const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const webpack = require('webpack')

module.exports = [
  // Chrome build configuration
  {
    name: 'chrome',
    mode: 'production',
    entry: {
      background: './src/background.js',
      content: './src/content.js',
    },
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist/chrome'),
    },
    optimization: {
      minimize: false,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
            },
          },
        },
      ],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'src/styles/panel.css', to: '../chrome/src/styles/panel.css' },
          { from: 'src/styles/comments.css', to: '../chrome/src/styles/comments.css' },
          { from: 'src/styles/form.css', to: '../chrome/src/styles/form.css' },
          { from: 'src/styles/markdown.css', to: '../chrome/src/styles/markdown.css' },
          { from: 'src/styles/modals.css', to: '../chrome/src/styles/modals.css' },
          { from: 'src/styles/responsive.css', to: '../chrome/src/styles/responsive.css' },
          { from: 'icons', to: '../chrome/icons' },
          { from: 'manifest-chrome.json', to: '../chrome/manifest.json' },
        ],
      }),
    ],
    resolve: {
      extensions: ['.js'],
    },
    target: ['web', 'es2020'],
  },
  // Firefox build configuration
  {
    name: 'firefox',
    mode: 'production',
    entry: {
      background: './src/background.js',
      content: './src/content.js',
    },
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist/firefox'),
      globalObject: 'globalThis', // Explicitly set global object
      environment: {
        // Specify the environment capabilities
        arrowFunction: true,
        bigIntLiteral: false,
        const: true,
        destructuring: true,
        dynamicImport: false, // Disable dynamic imports
        forOf: true,
        module: false,
      },
    },
    optimization: {
      minimize: false,
      concatenateModules: false, // Disable module concatenation
      providedExports: false,
      usedExports: false,
      sideEffects: false,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: {
                      firefox: '91', // Target Firefox ESR
                    },
                    modules: false, // Keep ES modules
                  },
                ],
              ],
            },
          },
        },
      ],
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'src/styles', to: '../firefox/src/styles' },
          { from: 'icons', to: '../firefox/icons' },
          { from: 'manifest-firefox.json', to: '../firefox/manifest.json' },
        ],
      }),
      // Define global object to avoid Function constructor
      new webpack.DefinePlugin({
        global: 'globalThis',
        window: 'globalThis',
      }),
    ],
    resolve: {
      extensions: ['.js'],
      fallback: {
        // Provide empty fallbacks for node modules
        global: false,
      },
    },
    target: 'webworker', // Use webworker target instead of web
    experiments: {
      outputModule: false,
    },
  },
]
