const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

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
          { from: 'src/styles.css', to: '../firefox/src' },
          { from: 'icons', to: '../firefox/icons' },
          { from: 'manifest-firefox.json', to: '../firefox/manifest.json' }
        ],
      }),
    ],
    resolve: {
      extensions: ['.js']
    },
    experiments: {
      outputModule: false
    },
    target: ['web', 'es2020']
  }
];
