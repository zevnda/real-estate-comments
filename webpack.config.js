const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = [
  // Chrome build configuration
  {
    name: 'chrome',
    mode: 'production',
    entry: {
      background: './src/background.js',
      content: './src/content.js'
    },
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist/chrome'),
    },
    optimization: {
      minimize: false
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'src/styles.css', to: '../chrome/src' },
          { from: 'icons', to: '../chrome/icons' },
          { from: 'manifest-chrome.json', to: '../chrome/manifest.json' }
        ],
      }),
    ],
    resolve: {
      extensions: ['.js']
    },
    target: ['web', 'es2020']
  },
  // Firefox build configuration
  {
    name: 'firefox',
    mode: 'production',
    entry: {
      background: './src/background.js',
      content: './src/content.js'
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
      }
    },
    optimization: {
      minimize: false,
      concatenateModules: false, // Disable module concatenation
      providedExports: false,
      usedExports: false,
      sideEffects: false
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
                ['@babel/preset-env', {
                  targets: {
                    firefox: '91' // Target Firefox ESR
                  },
                  modules: false // Keep ES modules
                }]
              ]
            }
          }
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: 'src/styles.css', to: '../firefox/src' },
          { from: 'icons', to: '../firefox/icons' },
          { from: 'manifest-firefox.json', to: '../firefox/manifest.json' }
        ],
      }),
      // Define global object to avoid Function constructor
      new webpack.DefinePlugin({
        'global': 'globalThis',
        'window': 'globalThis'
      })
    ],
    resolve: {
      extensions: ['.js'],
      fallback: {
        // Provide empty fallbacks for node modules
        "global": false
      }
    },
    target: 'webworker', // Use webworker target instead of web
    experiments: {
      outputModule: false
    }
  }
];
