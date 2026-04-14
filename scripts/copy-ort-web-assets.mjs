import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourceDir = resolve(root, "node_modules", "onnxruntime-web", "dist");
const targetDir = resolve(root, "public", "ort");

const files = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
];

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await copyFile(resolve(sourceDir, file), resolve(targetDir, file));
}

console.log(`Copied ONNX Runtime Web assets to ${targetDir}`);
