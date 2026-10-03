// SVGO config for distro logos (bunx svgo --config scripts/assets/svgo.config.mjs <file>).
// Logos render through <img>, so scripts never run, but we strip them anyway
// and drop editor metadata. Shapes and colors are left untouched: official
// logos must not be altered beyond lossless optimization.
export default {
  multipass: true,
  floatPrecision: 3,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          // Keep colors and shapes exactly as published.
          convertColors: false,
          mergePaths: false,
        },
      },
    },
    "removeScripts",
    "removeXlink",
    "removeDimensions",
  ],
};
