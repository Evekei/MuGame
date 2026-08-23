import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: ["android/**", "ios/**", "out/**", ".next/**"]
  },
  ...nextVitals,
  ...nextTypescript
];

export default eslintConfig;
