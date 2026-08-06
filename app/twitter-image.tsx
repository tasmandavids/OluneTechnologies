// The root layout sets an explicit `twitter` metadata block, which stops
// twitter:image from inheriting opengraph-image — so serve the same card here.
export { default, alt, size, contentType } from "./opengraph-image";
