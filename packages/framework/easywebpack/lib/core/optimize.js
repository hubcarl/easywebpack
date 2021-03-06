'use strict';
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
module.exports = class WebpackOptimize {
  constructor(ctx) {
    this.ctx = ctx;
    this.optimization = ctx.utils.cloneDeep(ctx.config.optimization || {});
    this.lib = this.ctx.config.lib;
  }

  getCommonsChunk() {
    const commonsChunks = [];
    const optimization = this.getWebOptimization();
    const { runtimeChunk = {}, splitChunks = {} } = optimization;
    if (this.ctx.utils.isObject(runtimeChunk) && runtimeChunk.name) {
      commonsChunks.push(runtimeChunk.name);
    }
    if (this.ctx.utils.isObject(splitChunks)) {
      const { cacheGroups = {} } = splitChunks;
      Object.keys(cacheGroups).forEach(key => {
        const group = cacheGroups[key];
        const name = group.name || key;
        if (!commonsChunks.includes(name)) {
          commonsChunks.push(name);
        }
      });
    }
    return commonsChunks;
  }

  getCacheVendors(minChunks) {
    const modules = [];
    const files = [];
    const lib = this.lib || ['.*'];
    lib.forEach(m => {
      if (/\.(jsx?|tsx?)$/.test(m)) {
        files.push(m);
      } else {
        modules.push(m);
      }
    });
    files.unshift(`node_modules/_?(${modules.join('|')})(@|/)?`);
    const strRegex = files.join('|');
    const test = new RegExp(strRegex);
    return {
      name: 'common',
      chunks: 'all',
      minChunks,
      test: module => {
        return test.test(module.context);
      }
    };
  }

  getCacheStyles(minChunks) {
    return {
      name: 'common',
      chunks: 'all',
      minChunks,
      test: /\.(css|less|scss|styl|stylus)$/,
      enforce: true,
      priority: 50
    };
  }

  normalizeChunks() {
    const { runtimeChunk, splitChunks } = this.optimization;
    if (runtimeChunk) {
      delete this.optimization.runtimeChunk;
    }
    if (splitChunks) {
      delete this.optimization.splitChunks;
    }
  }

  normalizeMinimizer(minimizer) {
    if (minimizer) {
      this.optimization.minimizer = [new CssMinimizerPlugin()].concat(minimizer);
    } else {
      this.optimization.minimizer = [new CssMinimizerPlugin(), this.createTerserMinimizer()];
    }
    if (!this.ctx.prod && this.optimization.minimizer) {
      delete this.optimization.minimizer;
    }
    return this.optimization;
  }

  getMinimizerOptions() {
    if (this.ctx.prod && !this.optimization.minimizer) {
      const uglifyJs = this.ctx.getConfigPlugin('uglifyJs');
      if (uglifyJs === true) {
        return {};
      }
      if (this.ctx.utils.isObject(uglifyJs)) {
        const options = uglifyJs.args || uglifyJs;
        if (options && options.uglifyOptions) {
          options.terserOptions = options.uglifyOptions;
          delete options.uglifyOptions;
          return options;
        }
      }
    }
    return null;
  }

  createTerserMinimizer() {
    const options = this.getMinimizerOptions();
    if (options) {
      return this.createTerserPlugin(options);
    }
    return new TerserPlugin();
  }

  createTerserPlugin(options) {
    const opt = this.ctx.merge({
      parallel: 2,
      terserOptions: {
        sourceMap: !!this.ctx.devtool,
        ie8: false,
        safari10: false,
        compress: {
          dead_code: true,
          drop_console: true,
          drop_debugger: true
        },
        output: {
          comments: false
        }
      }
    }, options);
    return new TerserPlugin(opt);
  }

  getOptimization() {
    return this.normalizeMinimizer(this.createTerserMinimizer());
  }

  getDLLOptimization() {
    this.normalizeChunks();
    return this.normalizeMinimizer(this.createTerserMinimizer());
  }

  getMinChunks() {
    const webpackConfig = this.ctx.webpackConfig;
    if (this.ctx.utils.isObject(webpackConfig.entry)) {
      const count = Object.keys(webpackConfig.entry).length;
      if (count > 1) {
        return Math.ceil(count / 2);
      }
    }
    return 1;
  }

  getWebOptimization() {
    const minChunks = this.getMinChunks();
    const minimizer = this.createTerserMinimizer();
    const optimization = this.normalizeMinimizer(minimizer);
    return this.ctx.merge({
      runtimeChunk: {
        name: 'runtime'
      },
      splitChunks: {
        name: false,
        chunks: 'all',
        minSize: this.lib ? 1 : 10000,
        minChunks,
        cacheGroups: {
          default: false,
          vendors: this.getCacheVendors(minChunks),
          styles: this.getCacheStyles(minChunks)
        }
      }
    }, optimization);
  }

  getNodeOptimization() {
    this.normalizeChunks();
    return this.normalizeMinimizer(this.createTerserMinimizer());
  }
};