"use client";

import * as ort from "onnxruntime-web";

type ModelConfig = {
  id2label?: Record<string, string>;
  image_size?: number;
  num_channels?: number;
};

type PreprocessorConfig = {
  crop_size?: {
    height?: number;
    width?: number;
  };
  do_normalize?: boolean;
  do_rescale?: boolean;
  do_resize?: boolean;
  image_mean?: number[];
  image_std?: number[];
  rescale_factor?: number;
  size?: {
    height?: number;
    width?: number;
  };
};

type RuntimeAssets = {
  inputName: string;
  labels: string[];
  mean: number[];
  modelConfig: ModelConfig;
  outputName: string;
  session: ort.InferenceSession;
  std: number[];
  targetHeight: number;
  targetWidth: number;
};

export type AnimeInferenceResult = {
  confidence: number;
  label: "ai" | "human";
  probabilities: {
    ai: number;
    human: number;
  };
};

const MODEL_BASE = "/models";
const MODEL_PATH = `${MODEL_BASE}/model_quantized.onnx`;
const CONFIG_PATH = `${MODEL_BASE}/config.json`;
const PREPROCESSOR_PATH = `${MODEL_BASE}/preprocessor_config.json`;

let assetsPromise: Promise<RuntimeAssets> | null = null;
let ortConfigured = false;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function softmax(values: number[]) {
  const maxValue = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - maxValue));
  const sum = exps.reduce((total, value) => total + value, 0);

  return exps.map((value) => value / sum);
}

function configureOrt() {
  if (ortConfigured || typeof window === "undefined") {
    return;
  }

  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = {
    wasm: new URL("/ort/ort-wasm-simd-threaded.wasm", window.location.origin),
    mjs: new URL("/ort/ort-wasm-simd-threaded.mjs", window.location.origin),
  };

  ortConfigured = true;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function getTargetSize(config: PreprocessorConfig, modelConfig: ModelConfig) {
  return {
    height:
      config.size?.height ??
      config.crop_size?.height ??
      modelConfig.image_size ??
      224,
    width:
      config.size?.width ??
      config.crop_size?.width ??
      modelConfig.image_size ??
      224,
  };
}

function getLabels(config: ModelConfig) {
  const mapping = config.id2label ?? { "0": "ai", "1": "human" };
  const sorted = Object.entries(mapping)
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map((entry) => entry[1].toLowerCase());

  return sorted.length > 0 ? sorted : ["ai", "human"];
}

function getProbabilityByAliases(
  labels: string[],
  probabilities: number[],
  aliases: string[],
) {
  for (const alias of aliases) {
    const index = labels.indexOf(alias);

    if (index >= 0) {
      return probabilities[index] ?? 0;
    }
  }

  return undefined;
}

async function getRuntimeAssets() {
  if (!assetsPromise) {
    configureOrt();

    assetsPromise = (async () => {
      const [modelBuffer, modelConfig, preprocessorConfig] = await Promise.all([
        fetch(MODEL_PATH).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to load model: ${response.status}`);
          }

          return response.arrayBuffer();
        }),
        fetchJson<ModelConfig>(CONFIG_PATH),
        fetchJson<PreprocessorConfig>(PREPROCESSOR_PATH),
      ]);

      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      const { height, width } = getTargetSize(preprocessorConfig, modelConfig);

      return {
        inputName: session.inputNames[0] ?? "pixel_values",
        labels: getLabels(modelConfig),
        mean: preprocessorConfig.image_mean ?? [0.5, 0.5, 0.5],
        modelConfig,
        outputName: session.outputNames[0] ?? "logits",
        session,
        std: preprocessorConfig.image_std ?? [0.5, 0.5, 0.5],
        targetHeight: height,
        targetWidth: width,
      };
    })();
  }

  return assetsPromise;
}

async function loadImageBitmap(file: File) {
  return createImageBitmap(file);
}

function preprocessImage(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  mean: number[],
  std: number[],
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("2d canvas context is unavailable");
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  const { data } = context.getImageData(0, 0, targetWidth, targetHeight);
  const planeSize = targetWidth * targetHeight;
  const tensorData = new Float32Array(planeSize * 3);

  for (let index = 0; index < planeSize; index += 1) {
    const offset = index * 4;
    const red = data[offset] / 255;
    const green = data[offset + 1] / 255;
    const blue = data[offset + 2] / 255;

    tensorData[index] = (red - mean[0]) / std[0];
    tensorData[planeSize + index] = (green - mean[1]) / std[1];
    tensorData[planeSize * 2 + index] = (blue - mean[2]) / std[2];
  }

  return tensorData;
}

export async function runAnimeAiInference(
  file: File,
): Promise<AnimeInferenceResult> {
  const [assets, bitmap] = await Promise.all([
    getRuntimeAssets(),
    loadImageBitmap(file),
  ]);

  try {
    const input = preprocessImage(
      bitmap,
      assets.targetWidth,
      assets.targetHeight,
      assets.mean,
      assets.std,
    );

    const tensor = new ort.Tensor("float32", input, [
      1,
      3,
      assets.targetHeight,
      assets.targetWidth,
    ]);

    const outputs = await assets.session.run({ [assets.inputName]: tensor });
    const logitsTensor = outputs[assets.outputName];

    if (!logitsTensor) {
      throw new Error(`Missing output tensor: ${assets.outputName}`);
    }

    const logits = Array.from(logitsTensor.data as Float32Array);
    const probabilities = softmax(logits);
    const ai = getProbabilityByAliases(assets.labels, probabilities, ["ai"]) ?? 0;
    const human =
      getProbabilityByAliases(assets.labels, probabilities, [
        "human",
        "real",
        "non-ai",
        "non_ai",
      ]) ??
      probabilities.find((_, index) => assets.labels[index] !== "ai") ??
      1 - ai;
    const label = ai >= human ? "ai" : "human";

    return {
      confidence: clamp(label === "ai" ? ai : human),
      label,
      probabilities: {
        ai: clamp(ai),
        human: clamp(human),
      },
    };
  } finally {
    bitmap.close();
  }
}
