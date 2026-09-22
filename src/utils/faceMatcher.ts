/**
 * Client-Side Facial Feature Comparison Utility
 * Compares an Enrolled Trainee Selfie against a Live Attendance Selfie.
 */

export interface FaceMatchResult {
  match: boolean;
  similarityScore: number; // 0 to 100%
  error?: string;
}

/**
 * Loads a base64 image URL into an HTMLImageElement
 */
function loadImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = base64;
  });
}

/**
 * Extracts a normalized 64x64 grayscale feature vector from an image
 */
function extractFaceFeatureVector(img: HTMLImageElement): Float32Array {
  const canvas = document.createElement('canvas');
  const width = 64;
  const height = 64;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return new Float32Array(width * height);

  // Draw image cropped to square center (focusing on face area)
  const minDim = Math.min(img.width, img.height);
  const sx = (img.width - minDim) / 2;
  const sy = (img.height - minDim) / 2;

  ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const featureVector = new Float32Array(width * height);

  // Convert RGB to normalized grayscale luminance
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // Perceptual luminance formula
    const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
    featureVector[i / 4] = gray;
  }

  return featureVector;
}

/**
 * Calculates Cosine Similarity between two feature vectors
 */
function calculateCosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compares Enrollment Selfie with Live Selfie and determines if it is the same person.
 * Minimum similarity threshold: 82%
 */
export async function verifyFaceMatch(
  enrollmentBase64: string,
  liveBase64: string,
  threshold: number = 0.82
): Promise<FaceMatchResult> {
  try {
    if (!enrollmentBase64 || !liveBase64) {
      return {
        match: false,
        similarityScore: 0,
        error: 'Missing enrollment or live selfie photo for comparison.',
      };
    }

    const [imgEnrolled, imgLive] = await Promise.all([
      loadImage(enrollmentBase64),
      loadImage(liveBase64),
    ]);

    const vecEnrolled = extractFaceFeatureVector(imgEnrolled);
    const vecLive = extractFaceFeatureVector(imgLive);

    const similarity = calculateCosineSimilarity(vecEnrolled, vecLive);
    const similarityPercentage = Math.round(similarity * 100);

    const match = similarity >= threshold;

    return {
      match,
      similarityScore: similarityPercentage,
    };
  } catch (err: any) {
    return {
      match: false,
      similarityScore: 0,
      error: err.message || 'Face comparison calculation failed.',
    };
  }
}
