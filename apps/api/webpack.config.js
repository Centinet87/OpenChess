const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    // Unir módulos rompe el `export * as $Enums` del cliente que genera Prisma 7,
    // y en un servidor Node no aporta nada. Va como plugin porque NxAppWebpackPlugin
    // reescribe `optimization`.
    {
      apply(compiler) {
        compiler.hooks.environment.tap('NoConcatenate', () => {
          compiler.options.optimization.concatenateModules = false;
        });
      },
    },
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
