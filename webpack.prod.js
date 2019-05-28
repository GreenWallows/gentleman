const webpack = require('webpack');
const merge = require('webpack-merge');
const common = require('./webpack.common');
const CleanCssPlugin = require('./clean-css-plugin');

module.exports = merge(common, {
    mode: 'production',
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [CleanCssPlugin.loader, 'css-loader']
            },
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV)
            }
        }),
        new CleanCssPlugin({ filename: "bundle" })
    ]
});