import eslintPluginYml from "eslint-plugin-yml";
import * as yamlParser from "yaml-eslint-parser";

export default [
    {
        ignores: ["coverage/**"],
    },
    {
        files: ["**/*.js"],
        rules: {
            "no-unused-vars": ["error", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }],
            "no-undef": "off"
        }
    },
    ...eslintPluginYml.configs["flat/recommended"],
    {
        files: ["**/*.{yaml,yml}"],
        languageOptions: {
            parser: yamlParser,
        },
        rules: {
            "yml/no-empty-mapping-value": "off",
        },
    }
];